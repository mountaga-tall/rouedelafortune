import { clearAdminSession } from "../_lib/auth.js";
import { json, methodNotAllowed, originAllowed } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!originAllowed(req)) return json(res, 403, { error: "Origine non autorisée." });
  clearAdminSession(res);
  return json(res, 200, { ok: true });
}
