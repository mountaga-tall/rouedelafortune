export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 16_384) throw new Error("Requête trop volumineuse.");
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return json(res, 405, { error: "Méthode non autorisée." });
}

export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return parsed.host === host;
  } catch {
    return false;
  }
}
