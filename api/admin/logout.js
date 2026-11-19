import { clearAdminSession } from "../../lib/server/auth.js";
import { json, methodNotAllowed, originAllowed } from "../../lib/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!originAllowed(req)) return json(res, 403, { error: "Origine non autorisée." });
  clearAdminSession(res);
  return json(res, 200, { ok: true });
}
