import { ensureSchema, getSql } from "./_lib/db.js";
import { json, methodNotAllowed, originAllowed, readJson } from "./_lib/http.js";
import { setCustomerSession } from "./_lib/auth.js";

const PRIVACY_NOTICE_VERSION = "2026-11-19-v1";

function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[\s().-]/g, "");
  if (/^0\d{9}$/.test(phone)) phone = "+225" + phone.slice(1);
  else if (/^225\d{8,10}$/.test(phone)) phone = "+" + phone;
  if (!/^\+\d{8,15}$/.test(phone)) return null;
  return phone;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!originAllowed(req)) return json(res, 403, { error: "Origine non autorisée." });

  try {
    const body = await readJson(req);
    if (body.website) return json(res, 400, { error: "Inscription invalide." });

    const firstName = String(body.firstName || "").trim().replace(/\s+/g, " ");
    const lastName = String(body.lastName || "").trim().replace(/\s+/g, " ");
    const email = String(body.email || "").trim().toLowerCase();
    const phone = normalizePhone(body.phone);
    const privacyConsent = body.privacyConsent === true;
    const marketingConsent = body.marketingConsent === true;

    if (firstName.length < 2 || firstName.length > 80) {
      return json(res, 400, { error: "Le prénom doit contenir entre 2 et 80 caractères." });
    }
    if (lastName.length < 2 || lastName.length > 80) {
      return json(res, 400, { error: "Le nom doit contenir entre 2 et 80 caractères." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: "Adresse e-mail invalide." });
    }
    if (!phone) {
      return json(res, 400, { error: "Téléphone invalide. Exemple : 07 00 00 00 00." });
    }
    if (!privacyConsent) {
      return json(res, 400, { error: "Le consentement au traitement des données est nécessaire pour participer." });
    }

    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO customers (
        first_name, last_name, phone, email,
        privacy_notice_version, privacy_consent_at,
        marketing_consent, marketing_consent_at,
        last_seen_at, updated_at
      )
      VALUES (
        ${firstName}, ${lastName}, ${phone}, ${email},
        ${PRIVACY_NOTICE_VERSION}, NOW(),
        ${marketingConsent},
        CASE WHEN ${marketingConsent} THEN NOW() ELSE NULL END,
        NOW(), NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        privacy_notice_version = EXCLUDED.privacy_notice_version,
        privacy_consent_at = NOW(),
        marketing_consent = EXCLUDED.marketing_consent,
        marketing_consent_at = EXCLUDED.marketing_consent_at,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING id, first_name
    `;

    setCustomerSession(res, rows[0].id);
    return json(res, 201, {
      ok: true,
      participant: { firstName: rows[0].first_name },
      message: "Inscription enregistrée. Bonne chance !"
    });
  } catch (error) {
    console.error("Erreur inscription EL PATRÓN:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Impossible d'enregistrer l'inscription pour le moment. Réessayez." });
  }
}
