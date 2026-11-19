import { randomInt } from "node:crypto";
import { ensureSchema, getSql } from "../lib/server/db.js";
import { getCustomerId } from "../lib/server/auth.js";
import { json, methodNotAllowed, originAllowed, readJson } from "../lib/server/http.js";

const PRIZES = {
  "Un fresco": "🥤",
  "Une portion de frite": "🍟",
  "Un demi poulet rôti": "🍗",
  "Un chawarma": "🌯",
  "Pas de chance": "🍀",
  "Pas de chance cette fois": "🍀"
};

function makeValidationCode() {
  return "#EP-" + randomInt(1000, 10000);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!originAllowed(req)) return json(res, 403, { error: "Origine non autorisée." });

  const customerId = getCustomerId(req);
  if (!customerId) return json(res, 401, { error: "Inscription nécessaire avant de jouer." });

  try {
    const body = await readJson(req);
    const label = String(body.label || "").trim();
    if (!Object.prototype.hasOwnProperty.call(PRIZES, label)) {
      return json(res, 400, { error: "Résultat de jeu non reconnu." });
    }

    const isWin = Object.prototype.hasOwnProperty.call({
      "Un fresco": true,
      "Une portion de frite": true,
      "Un demi poulet rôti": true,
      "Un chawarma": true
    }, label);
    const icon = PRIZES[label];
    const validationCode = isWin ? makeValidationCode() : null;

    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO spins (customer_id, prize_label, prize_icon, is_win, validation_code)
      SELECT ${customerId}::uuid, ${label}, ${icon}, ${isWin}, ${validationCode}
      WHERE EXISTS (SELECT 1 FROM customers WHERE id = ${customerId}::uuid)
      RETURNING id, played_at
    `;

    if (!rows.length) return json(res, 401, { error: "Participant introuvable. Réinscrivez-vous." });

    return json(res, 201, {
      ok: true,
      spinId: rows[0].id,
      label,
      icon,
      isWin,
      validationCode,
      playedAt: rows[0].played_at
    });
  } catch (error) {
    console.error("Erreur enregistrement tirage EL PATRÓN:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Le résultat n'a pas pu être enregistré. Prévenez un membre de l'équipe." });
  }
}
