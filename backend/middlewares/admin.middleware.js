import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiError.js";

const cookieName = "tesla_pool_admin_session";
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/" };

function sameSecret(input, expected) {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 16);
}

export function checkAdminCredentials(username, password) {
  if (!adminConfigured()) throw new ApiError(503, "Admin login is not configured.");
  return sameSecret(String(username || ""), process.env.ADMIN_USERNAME) && sameSecret(String(password || ""), process.env.ADMIN_PASSWORD);
}

export function setAdminSession(response) {
  const token = jwt.sign({ role: "admin", tokenType: "access" }, process.env.AccessTokenSecret, { algorithm: "HS256", expiresIn: "1h" });
  response.cookie(cookieName, token, { ...cookieOptions, maxAge: 60 * 60 * 1000 });
}

export function clearAdminSession(response) {
  response.clearCookie(cookieName, cookieOptions);
}

export function verifyAdmin(request, _response, next) {
  try {
    const token = request.cookies?.[cookieName];
    if (!token) throw new Error("Missing admin session");
    const payload = jwt.verify(token, process.env.AccessTokenSecret, { algorithms: ["HS256"] });
    if (payload.role !== "admin" || payload.tokenType !== "access") throw new Error("Wrong role");
    next();
  } catch {
    next(new ApiError(401, "Admin sign-in is required."));
  }
}
