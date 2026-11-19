import { createHmac, timingSafeEqual } from "node:crypto";

const CUSTOMER_COOKIE = "elpatron_player";
const ADMIN_COOKIE = "elpatron_admin";

function secret() {
  const value = process.env.ELPATRON_SESSION_SECRET;
  if (!value) throw new Error("La clé de session n'est pas configurée.");
  return value;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + signature;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const entry = header.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function setCustomerSession(res, customerId) {
  const token = sign({
    sub: customerId,
    role: "player",
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  });
  res.setHeader("Set-Cookie", `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(30 * 24 * 60 * 60)}`);
}

export function getCustomerId(req) {
  const payload = verify(readCookie(req, CUSTOMER_COOKIE));
  return payload?.role === "player" && typeof payload.sub === "string" ? payload.sub : null;
}

export function setAdminSession(res) {
  const token = sign({
    sub: "admin",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  });
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(8 * 60 * 60)}`);
}

export function clearAdminSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function isAdmin(req) {
  const payload = verify(readCookie(req, ADMIN_COOKIE));
  return payload?.role === "admin" && payload.sub === "admin";
}
