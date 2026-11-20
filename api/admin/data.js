import { ensureSchema, getSql } from "../../lib/server/db.js";
import { isAdmin } from "../../lib/server/auth.js";
import { json, methodNotAllowed } from "../../lib/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!isAdmin(req)) return json(res, 401, { error: "Authentification administrateur requise." });

  try {
    await ensureSchema();
    const sql = getSql();
    const search = String(req.query?.search || "").trim().slice(0, 100);
    const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";

    const customers = search
      ? await sql`
          SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
                 c.marketing_consent, c.created_at, c.last_seen_at,
                 COUNT(s.id)::int AS total_spins,
                 COUNT(s.id) FILTER (WHERE s.is_win)::int AS total_wins,
                 MAX(s.played_at) AS last_played_at
          FROM customers c
          LEFT JOIN spins s ON s.customer_id = c.id
          WHERE c.first_name ILIKE ${pattern}
             OR c.last_name ILIKE ${pattern}
             OR c.email ILIKE ${pattern}
             OR c.phone ILIKE ${pattern}
          GROUP BY c.id
          ORDER BY c.created_at DESC
          LIMIT 2000
        `
      : await sql`
          SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
                 c.marketing_consent, c.created_at, c.last_seen_at,
                 COUNT(s.id)::int AS total_spins,
                 COUNT(s.id) FILTER (WHERE s.is_win)::int AS total_wins,
                 MAX(s.played_at) AS last_played_at
          FROM customers c
          LEFT JOIN spins s ON s.customer_id = c.id
          GROUP BY c.id
          ORDER BY c.created_at DESC
          LIMIT 2000
        `;

    const totals = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM customers) AS customers,
        (SELECT COUNT(*)::int FROM spins) AS spins,
        (SELECT COUNT(*)::int FROM spins WHERE is_win = TRUE) AS wins
    `;
    const gameRows = await sql`
      SELECT total_spins, spins_since_last_win,
             (pending_winning_challenge IS NOT NULL AND pending_winning_expires_at > NOW()) AS prize_pending
      FROM game_state
      WHERE id = 1
    `;
    const gameState = gameRows[0] || {
      total_spins: 0,
      spins_since_last_win: 0,
      prize_pending: false
    };
    const spinsSinceLastWin = Number(gameState.spins_since_last_win || 0);
    const game = {
      totalSpins: Number(gameState.total_spins || 0),
      spinsSinceLastWin,
      prizePending: Boolean(gameState.prize_pending),
      spinsUntilNextPrize: gameState.prize_pending
        ? 0
        : Math.max(0, 50 - spinsSinceLastWin)
    };

    const recentSpins = await sql`
      SELECT s.id, s.prize_label, s.prize_icon, s.is_win, s.validation_code, s.spin_number, s.played_at,
             c.first_name, c.last_name, c.phone
      FROM spins s
      JOIN customers c ON c.id = s.customer_id
      ORDER BY s.played_at DESC
      LIMIT 100
    `;

    return json(res, 200, {
      totals: totals[0],
      game,
      customers,
      recentSpins,
      truncated: customers.length === 2000
    });
  } catch (error) {
    console.error("Erreur tableau de bord EL PATRÓN:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Impossible de charger les données du tableau de bord." });
  }
}
