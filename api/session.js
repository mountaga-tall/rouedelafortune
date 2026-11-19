import { ensureSchema, getSql } from "./_lib/db.js";
import { getCustomerId } from "./_lib/auth.js";
import { json, methodNotAllowed } from "./_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const customerId = getCustomerId(req);
  if (!customerId) return json(res, 401, { authenticated: false });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT first_name FROM customers WHERE id = ${customerId} LIMIT 1`;
    if (!rows.length) return json(res, 401, { authenticated: false });
    return json(res, 200, { authenticated: true, firstName: rows[0].first_name });
  } catch (error) {
    console.error("Erreur session EL PATRÓN:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Vérification de session indisponible." });
  }
}
