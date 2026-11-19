import { randomInt } from "node:crypto";
import { ensureSchema, getSql } from "../lib/server/db.js";
import { getCustomerId } from "../lib/server/auth.js";
import { json, methodNotAllowed, originAllowed, readJson } from "../lib/server/http.js";

const WINNING_PRIZES = [
  { label: "Un fresco", isWin: true, icon: "🥤", bg: "#059669", text: "#ffffff" },
  { label: "Une portion de frite", isWin: true, icon: "🍟", bg: "#d97706", text: "#ffffff" },
  { label: "Un demi poulet rôti", isWin: true, icon: "🍗", bg: "#C81D11", text: "#ffffff" },
  { label: "Un chawarma", isWin: true, icon: "🌯", bg: "#7c3aed", text: "#ffffff" }
];
const LOSE_STYLES = [
  { label: "Pas de chance", isWin: false, icon: "🍀", bg: "#1c1917", text: "#e7e5e4" },
  { label: "Pas de chance", isWin: false, icon: "🎲", bg: "#292524", text: "#d6d3d1" }
];

function shuffleSecure(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSegments() {
  const totalSlots = 14;
  const shuffledPrizes = shuffleSecure(WINNING_PRIZES);
  const positions = [0, 3, 7, 10];
  const shift = randomInt(totalSlots);
  const winners = new Map();

  positions.forEach((position, index) => {
    winners.set((position + shift) % totalSlots, shuffledPrizes[index]);
  });

  const segments = [];
  let loseCounter = 0;
  for (let i = 0; i < totalSlots; i++) {
    if (winners.has(i)) {
      segments.push(winners.get(i));
    } else {
      segments.push({ ...LOSE_STYLES[loseCounter % LOSE_STYLES.length] });
      loseCounter++;
    }
  }
  return segments;
}

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
    await ensureSchema();
    const sql = getSql();

    if (body.action === "start") {
      // Un seul tirage peut être lancé toutes les six secondes pour éviter les relances abusives.
      const lock = await sql`
        UPDATE customers
        SET last_spin_started_at = NOW(), last_seen_at = NOW()
        WHERE id = ${customerId}::uuid
          AND (last_spin_started_at IS NULL OR last_spin_started_at < NOW() - INTERVAL '6 seconds')
        RETURNING id
      `;
      if (!lock.length) {
        return json(res, 429, { error: "Patientez quelques secondes avant de relancer la roue." });
      }

      await sql`
        UPDATE spin_challenges
        SET completed_at = NOW()
        WHERE customer_id = ${customerId}::uuid AND completed_at IS NULL
      `;

      const segments = buildSegments();
      const targetIndex = randomInt(segments.length);
      const selected = segments[targetIndex];
      const rows = await sql`
        INSERT INTO spin_challenges (
          customer_id, segments, target_index, prize_label, prize_icon, is_win
        )
        VALUES (
          ${customerId}::uuid,
          ${JSON.stringify(segments)}::jsonb,
          ${targetIndex},
          ${selected.label},
          ${selected.icon},
          ${selected.isWin}
        )
        RETURNING id, expires_at
      `;

      return json(res, 201, {
        ok: true,
        challengeId: rows[0].id,
        segments,
        targetIndex,
        expiresAt: rows[0].expires_at
      });
    }

    if (body.action === "finish") {
      const challengeId = String(body.challengeId || "");
      if (!/^[0-9a-f-]{36}$/i.test(challengeId)) {
        return json(res, 400, { error: "Identifiant de tirage invalide." });
      }

      const validationCode = makeValidationCode();
      // Le challenge n'est consommé qu'une seule fois et uniquement après le délai minimal d'animation.
      const rows = await sql`
        WITH claimed AS (
          UPDATE spin_challenges
          SET completed_at = NOW()
          WHERE id = ${challengeId}::uuid
            AND customer_id = ${customerId}::uuid
            AND completed_at IS NULL
            AND expires_at > NOW()
            AND created_at <= NOW() - INTERVAL '4.5 seconds'
          RETURNING customer_id, prize_label, prize_icon, is_win
        )
        INSERT INTO spins (customer_id, prize_label, prize_icon, is_win, validation_code)
        SELECT customer_id, prize_label, prize_icon, is_win,
               CASE WHEN is_win THEN ${validationCode} ELSE NULL END
        FROM claimed
        RETURNING id, played_at, prize_label, prize_icon, is_win, validation_code
      `;

      if (!rows.length) {
        return json(res, 409, { error: "Ce tirage a expiré ou a déjà été utilisé. Relancez la roue." });
      }

      return json(res, 201, {
        ok: true,
        spinId: rows[0].id,
        label: rows[0].prize_label,
        icon: rows[0].prize_icon,
        isWin: rows[0].is_win,
        validationCode: rows[0].validation_code,
        playedAt: rows[0].played_at
      });
    }

    return json(res, 400, { error: "Action de tirage inconnue." });
  } catch (error) {
    console.error("Erreur tirage EL PATRÓN:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Impossible de traiter ce tirage. Réessayez." });
  }
}
