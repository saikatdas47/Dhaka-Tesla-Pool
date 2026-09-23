import { ApiError } from "./apiError.js";

export function cleanAccountInput(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body?.password;

  if (name.length < 2 || name.length > 80) throw new ApiError(400, "Name must be 2 to 80 characters.");
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new ApiError(400, "Username must be 3 to 30 lowercase letters, numbers, or underscores.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) throw new ApiError(400, "Password must be at least 8 characters and at most 72 bytes.");

  return { name, username, email, password };
}

export function cleanLoginInput(body) {
  const identity = typeof body?.identity === "string" ? body.identity.trim().toLowerCase() : typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!identity || typeof body?.password !== "string") throw new ApiError(400, "Email or username and password are required.");
  return { identity, password: body.password };
}
