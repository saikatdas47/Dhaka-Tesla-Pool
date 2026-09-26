import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiError.js";
import {
  accessCookieNames,
  refreshCookieNames,
  cookieOptions,
  durationMs,
  accessExpiry,
  refreshExpiry,
} from "../utils/tokenConfig.js";

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function startSession(Model, account, role, response) {
  const accessToken = account.generateAccessToken();
  const refreshToken = account.generateRefreshToken();
  await Model.updateOne(
    { _id: account.id },
    { $set: { refreshTokenHash: tokenHash(refreshToken) } },
  );
  response.cookie(
    accessCookieNames[role],
    accessToken,
    cookieOptions(durationMs(accessExpiry())),
  );
  response.cookie(
    refreshCookieNames[role],
    refreshToken,
    cookieOptions(durationMs(refreshExpiry())),
  );
  return accessToken;
}

export function verifyAccessToken(token, role) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.AccessTokenSecret, {
      algorithms: ["HS256"],
    });
    if (payload.tokenType !== "access" || payload.role !== role)
      throw new ApiError(401, `${role} sign-in is required.`);
    return payload;
  } catch (error) {
    // Existing sessions were signed with JWT_SECRET. Keep them until their original expiry.
    if (error instanceof ApiError) throw error;
    let verificationError = error;
    if (
      process.env.JWT_SECRET &&
      process.env.JWT_SECRET !== process.env.AccessTokenSecret
    ) {
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET, {
          algorithms: ["HS256"],
        });
        if (
          !payload.tokenType &&
          (payload.role === role || (role === "passenger" && !payload.role))
        )
          return payload;
      } catch (legacyError) {
        if (legacyError.name === "TokenExpiredError")
          verificationError = legacyError;
      }
    }
    throw new ApiError(
      401,
      verificationError.name === "TokenExpiredError"
        ? "Session expired. Please sign in again."
        : "Invalid session. Please sign in again.",
    );
  }
}

function verifyRefreshToken(token, role) {
  try {
    const payload = jwt.verify(token, process.env.RefreshTokenSecret, {
      algorithms: ["HS256"],
    });
    if (payload.tokenType !== "refresh" || payload.role !== role)
      throw new Error("Wrong token type or role");
    return payload;
  } catch {
    throw new ApiError(
      401,
      "Invalid or expired refresh token. Please sign in again.",
    );
  }
}

export async function refreshSession(Model, role, request, response) {
  const incoming =
    request.cookies?.[refreshCookieNames[role]] || request.body?.refreshToken;
  if (!incoming) throw new ApiError(401, "Refresh token is required.");
  const payload = verifyRefreshToken(incoming, role);
  const account = await Model.findById(payload.sub);
  if (!account)
    throw new ApiError(401, "Account not found. Please sign in again.");

  const replacement = account.generateRefreshToken();
  const rotated = await Model.findOneAndUpdate(
    { _id: account.id, refreshTokenHash: tokenHash(incoming) },
    { $set: { refreshTokenHash: tokenHash(replacement) } },
    { new: true },
  );
  if (!rotated)
    throw new ApiError(401, "Refresh token was already used or revoked.");

  const accessToken = account.generateAccessToken();
  response.cookie(
    accessCookieNames[role],
    accessToken,
    cookieOptions(durationMs(accessExpiry())),
  );
  response.cookie(
    refreshCookieNames[role],
    replacement,
    cookieOptions(durationMs(refreshExpiry())),
  );
  return accessToken;
}

export async function endSession(Model, role, request, response) {
  const incoming = request.cookies?.[refreshCookieNames[role]];
  if (incoming) {
    try {
      const payload = verifyRefreshToken(incoming, role);
      await Model.updateOne(
        { _id: payload.sub, refreshTokenHash: tokenHash(incoming) },
        { $set: { refreshTokenHash: null } },
      );
    } catch {
      /* Invalid/expired token still gets its cookies cleared. */
    }
  }
  response.clearCookie(accessCookieNames[role], cookieOptions());
  response.clearCookie(refreshCookieNames[role], cookieOptions());
}
