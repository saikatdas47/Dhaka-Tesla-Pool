import Passenger from "../models/Passenger.js";
import Driver from "../models/Driver.js";
import { ApiError } from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../services/sessionService.js";
import { accessCookieNames } from "../utils/tokenConfig.js";
import { demoAccountsEnabled } from "../config/demoAccounts.js";

function accessTokenFromRequest(request, role) {
  const header = request.get("authorization");
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return bearerToken || request.cookies?.[accessCookieNames[role]];
}

// Put this before a protected controller: it attaches the logged-in passenger to req.
export const verifyPassenger = asyncHandler(
  async (request, _response, next) => {
    const token = accessTokenFromRequest(request, "passenger");
    if (!token) throw new ApiError(401, "Please log in.");
    const payload = verifyAccessToken(token, "passenger");

    const passenger = await Passenger.findById(payload.sub);
    if (!passenger) throw new ApiError(401, "Passenger account not found.");
    if (passenger.isDemo && !demoAccountsEnabled())
      throw new ApiError(401, "Demo access is disabled.");
    request.passenger = passenger;
    next();
  },
);

export const verifyDriver = asyncHandler(async (request, _response, next) => {
  const token = accessTokenFromRequest(request, "driver");
  if (!token) throw new ApiError(401, "Please sign in as a driver.");
  const payload = verifyAccessToken(token, "driver");

  const driver = await Driver.findById(payload.sub);
  if (!driver) throw new ApiError(401, "Driver account not found.");
  if (driver.isDemo && !demoAccountsEnabled())
    throw new ApiError(401, "Demo access is disabled.");
  request.driver = driver;
  next();
});

// Stop a second upload while a failed one is waiting for retry.
export function requireNoPendingAvatar(request, response, next) {
  if ((request.passenger || request.driver)?.pendingAvatarFilename) {
    return next(
      new ApiError(
        409,
        "A previous image is waiting for retry. Retry it first.",
      ),
    );
  }
  next();
}
