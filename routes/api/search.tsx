import { sql } from "kysely"
import { withWinterSpec } from "lib/with-winter-spec"
import { z } from "zod"

const extractSmallQuantityPrice = (price: string | null): string => {
  if (!price) return ""
  try {
    const priceObj = JSON.parse(price)
    return priceObj[0]?.price || ""
  } catch {
    return ""
  }
}

export default withWinterSpec({
  auth: "none",
  methods: ["GET"],
  queryParams: z.object({
    package: z.string().optional(),
    full: z.boolean().optional(),
    q: z.string().optional(),
    limit: z.string().optional(),
  }),
  jsonResponse: z.any(),
} as const)(async (req, ctx) => {
  const limit = parseInt(req.query.limit ?? "100", 10) || 100

  let query = ctx.db
    .selectFrom("components")
    .selectAll()
    .limit(limit)
    .orderBy("stock", "desc")
    .where("stock", ">", 0)

  if (req.query.package) {
    query = query.where("package", "=", req.query.package)
  }

if (req.query.q) { 
   const searchTerm = req.query.q.trim(); 
   const normalizedSearch = searchTerm.toLowerCase(); 

   // Build FTS5 query for scrambled word search 
   const terms = normalizedSearch.split(/\s+/); 
   const ftsQuery = terms
     .map((term) => `"${term}"*`) // Prefix matching for each term 
     .join(" OR "); // Allow scrambled word order 

   // Ensure all terms are present using NEAR
   if (terms.length > 1) {
     ftsQuery += ` NEAR ${terms.length}`;
   }

   // Use raw SQL for FTS5 MATCH query and cast lcsc to number 
   query = query.where( 
     sql<boolean>`lcsc IN ( 
       SELECT CAST(lcsc AS INTEGER) FROM components_fts 
       WHERE components_fts MATCH ${ftsQuery} 
       ORDER BY rank 
     )`, 
   ); 
}
/**
  if (req.query.q) {
    const searchTerm = req.query.q.trim()
    const normalizedSearch = searchTerm.toLowerCase()

    // Build FTS5 query for scrambled word search
    const terms = normalizedSearch.split(/\s+/)
    const ftsQuery = terms
      .map((term) => `"${term}"*`) // Prefix matching for each term
      .join(" OR ") // Allow scrambled word order
      .concat(` NEAR/${terms.length}`) // Ensure all terms are present

    // Use raw SQL for FTS5 MATCH query and cast lcsc to number
    query = query.where(
      sql<boolean>`lcsc IN (
        SELECT CAST(lcsc AS INTEGER) FROM components_fts
        WHERE components_fts MATCH ${ftsQuery}
        ORDER BY rank
      )`,
    )
  }**/

  const fullComponents = await query.execute()

  const components = fullComponents.map((c) => ({
    lcsc: c.lcsc,
    mfr: c.mfr,
    package: c.package,
    description: c.description,
    stock: c.stock,
    price: extractSmallQuantityPrice(c.price),
  }))

  return ctx.json({
    components: req.query.full ? fullComponents : components,
  })
})
