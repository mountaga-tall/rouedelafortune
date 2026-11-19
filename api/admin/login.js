import { timingSafeEqual } from "node:crypto";
import { json, methodNotAllowed, originAllowed, readJson } from "../../lib/server/http.js";
import { setAdminSession } from "../../lib/server/auth.js";

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!originAllowed(req)) return json(res, 403, { error: "Origine non autorisée." });

  try {
    const body = await readJson(req);
    const supplied = String(body.password || "");
    const expected = process.env.ELPATRON_ADMIN_PASSWORD;
    if (!expected) return json(res, 503, { error: "Connexion administrateur non configurée." });
    if (supplied.length > 200 || !safeEqual(supplied, expected)) {
      return json(res, 401, { error: "Mot de passe incorrect." });
    }
    setAdminSession(res);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Erreur connexion administrateur:", error?.message || "Erreur inconnue");
    return json(res, 500, { error: "Connexion indisponible." });
  }
}
