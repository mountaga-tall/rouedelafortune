import { randomInt, randomUUID } from "node:crypto";
import { ensureSchema, getSql } from "../lib/server/db.js";
import { getCustomerId } from "../lib/server/auth.js";
import { json, methodNotAllowed, originAllowed, readJson } from "../lib/server/http.js";

const MIN_SPINS_BETWEEN_PRIZES = 50;

const WINNING_PRIZES = [
  { label: "Un plat de frites", wheelLabel: "Plat de frites", isWin: true, icon: "🍟", bg: "#d97706", text: "#ffffff" },
  { label: "Une petite bouteille d'eau", wheelLabel: "Bouteille d'eau", isWin: true, icon: "💧", bg: "#0284c7", text: "#ffffff" },
  { label: "Un chawarma", wheelLabel: "Chawarma", isWin: true, icon: "🌯", bg: "#7c3aed", text: "#ffffff" },
  { label: "Une boule de glace", wheelLabel: "Boule de glace", isWin: true, icon: "🍨", bg: "#db2777", text: "#ffffff" },
  { label: "Une pizza moyenne", wheelLabel: "Pizza moyenne", isWin: true, icon: "🍕", bg: "#b91c1c", text: "#ffffff" },
  { label: "Un demi poulet au choix", wheelLabel: "Demi poulet au choix", isWin: true, icon: "🍗", bg: "#C81D11", text: "#ffffff" },
  { label: "Une canette non alcoolisée", wheelLabel: "Canette sans alcool", isWin: true, icon: "🥤", bg: "#059669", text: "#ffffff" },
  { label: "Un Fresco", wheelLabel: "Fresco", isWin: true, icon: "🧃", bg: "#0ea5e9", text: "#ffffff" }
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
  const orderedPrizes = shuffleSecure(WINNING_PRIZES.map(prize => ({ ...prize })));
  // Les icônes des cases perdantes alternent toujours : dé, trèfle, dé, trèfle...
  // Le premier symbole varie à chaque tirage, mais deux pertes consécutives ne sont jamais identiques.
  const firstLosingStyle = randomInt(LOSE_STYLES.length);
  const losingSectors = Array.from({ length: 24 }, (_, index) => ({
    ...LOSE_STYLES[(firstLosingStyle + index) % LOSE_STYLES.length]
  }));

  // 3 cases « Pas de chance » entre chacun des 8 cadeaux : 32 secteurs au total.
  const segments = [];
  let losingIndex = 0;
  orderedPrizes.forEach(prize => {
    segments.push(prize);
    segments.push(
      losingSectors[losingIndex++],
      losingSectors[losingIndex++],
      losingSectors[losingIndex++]
    );
  });

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

      // Ferme un ancien tirage inachevé de ce joueur et libère son éventuel lot réservé.
      await sql`
        WITH closed AS (
          UPDATE spin_challenges
          SET completed_at = NOW()
          WHERE customer_id = ${customerId}::uuid AND completed_at IS NULL
          RETURNING id
        )
        UPDATE game_state
        SET pending_winning_challenge = NULL,
            pending_winning_expires_at = NULL,
            updated_at = NOW()
        WHERE id = 1
          AND pending_winning_challenge IN (SELECT id FROM closed)
      `;

      const challengeId = randomUUID();
      // Le compteur est global à tous les clients. À 50, un seul lot est réservé.
      // Si le joueur abandonne, le lot reste disponible après expiration de sa réservation.
      const stateRows = await sql`
        UPDATE game_state
        SET total_spins = total_spins + 1,
            spins_since_last_win = LEAST(spins_since_last_win + 1, ${MIN_SPINS_BETWEEN_PRIZES}),
            pending_winning_challenge = CASE
              WHEN spins_since_last_win >= ${MIN_SPINS_BETWEEN_PRIZES - 1}
                AND (pending_winning_challenge IS NULL OR pending_winning_expires_at <= NOW())
              THEN ${challengeId}::uuid
              ELSE pending_winning_challenge
            END,
            pending_winning_expires_at = CASE
              WHEN spins_since_last_win >= ${MIN_SPINS_BETWEEN_PRIZES - 1}
                AND (pending_winning_challenge IS NULL OR pending_winning_expires_at <= NOW())
              THEN NOW() + INTERVAL '5 minutes'
              ELSE pending_winning_expires_at
            END,
            updated_at = NOW()
        WHERE id = 1
        RETURNING total_spins, spins_since_last_win, pending_winning_challenge
      `;
      if (!stateRows.length) throw new Error("Compteur global du jeu introuvable.");

      const state = stateRows[0];
      const spinNumber = Number(state.total_spins);
      const isWinningTurn = String(state.pending_winning_challenge || "") === challengeId;
      const segments = buildSegments();
      const eligibleIndices = [];
      segments.forEach((segment, index) => {
        if (Boolean(segment.isWin) === isWinningTurn) eligibleIndices.push(index);
      });
      const targetIndex = eligibleIndices[randomInt(eligibleIndices.length)];
      const selected = segments[targetIndex];

      let inserted;
      try {
        inserted = await sql`
          INSERT INTO spin_challenges (
            id, customer_id, segments, target_index, prize_label, prize_icon,
            is_win, spin_number
          )
          VALUES (
            ${challengeId}::uuid, ${customerId}::uuid, ${JSON.stringify(segments)}::jsonb,
            ${targetIndex}, ${selected.label}, ${selected.icon},
            ${isWinningTurn}, ${spinNumber}
          )
          RETURNING expires_at
        `;
      } catch (error) {
        // Si la création échoue, libère immédiatement le lot réservé pour ne pas bloquer la roue.
        if (isWinningTurn) {
          await sql`
            UPDATE game_state
            SET pending_winning_challenge = NULL,
                pending_winning_expires_at = NULL,
                updated_at = NOW()
            WHERE id = 1 AND pending_winning_challenge = ${challengeId}::uuid
          `;
        }
        throw error;
      }

      return json(res, 201, {
        ok: true,
        challengeId,
        segments,
        targetIndex,
        spinNumber,
        prizeInterval: MIN_SPINS_BETWEEN_PRIZES,
        isWinningTurn,
        expiresAt: inserted[0].expires_at
      });
    }

    if (body.action === "finish") {
      const challengeId = String(body.challengeId || "");
      if (!/^[0-9a-f-]{36}$/i.test(challengeId)) {
        return json(res, 400, { error: "Identifiant de tirage invalide." });
      }

      const validationCode = makeValidationCode();
      // Le lot réservé est validé une seule fois, avec le compteur remis à zéro dans la même requête SQL.
      const rows = await sql`
        WITH claimed AS (
          UPDATE spin_challenges
          SET completed_at = NOW()
          WHERE id = ${challengeId}::uuid
            AND customer_id = ${customerId}::uuid
            AND completed_at IS NULL
            AND expires_at > NOW()
            AND created_at <= NOW() - INTERVAL '4.5 seconds'
            AND (
              is_win = FALSE
              OR EXISTS (
                SELECT 1 FROM game_state
                WHERE id = 1
                  AND pending_winning_challenge = ${challengeId}::uuid
                  AND pending_winning_expires_at > NOW()
              )
            )
          RETURNING customer_id, prize_label, prize_icon, is_win, target_index, spin_number
        ),
        inserted AS (
          INSERT INTO spins (
            customer_id, prize_label, prize_icon, is_win, validation_code, spin_number
          )
          SELECT customer_id, prize_label, prize_icon, is_win,
                 CASE WHEN is_win THEN ${validationCode} ELSE NULL END,
                 spin_number
          FROM claimed
          RETURNING id, played_at, prize_label, prize_icon, is_win, validation_code, spin_number
        ),
        released AS (
          UPDATE game_state
          SET spins_since_last_win = 0,
              pending_winning_challenge = NULL,
              pending_winning_expires_at = NULL,
              updated_at = NOW()
          WHERE id = 1 AND EXISTS (SELECT 1 FROM inserted WHERE is_win = TRUE)
          RETURNING id
        )
        SELECT inserted.*, claimed.target_index
        FROM inserted
        INNER JOIN claimed ON claimed.spin_number = inserted.spin_number
      `;

      if (!rows.length) {
        return json(res, 409, { error: "Ce tirage a expiré, a déjà été utilisé ou doit être relancé. Aucun cadeau n'a été validé." });
      }

      return json(res, 201, {
        ok: true,
        spinId: rows[0].id,
        label: rows[0].prize_label,
        icon: rows[0].prize_icon,
        isWin: rows[0].is_win,
        validationCode: rows[0].validation_code,
        spinNumber: Number(rows[0].spin_number),
        targetIndex: Number(rows[0].target_index),
        playedAt: rows[0].played_at
      });
    }

    return json(res, 400, { error: "Action de tirage inconnue." });
  } catch (error) {
    console.error("Erreur tirage EL PATRÓN:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Impossible de traiter ce tirage. Réessayez." });
  }
}
