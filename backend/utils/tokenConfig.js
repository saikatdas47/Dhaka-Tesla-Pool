export const accessCookieNames = {
  passenger: "tesla_pool_session",
  driver: "tesla_pool_driver_session",
};

export const refreshCookieNames = {
  passenger: "tesla_pool_passenger_refresh",
  driver: "tesla_pool_driver_refresh",
};

export function durationMs(value) {
  const match = /^(\d+)([mhd])$/.exec(value);
  if (!match)
    throw new Error("Token expiry must use m, h, or d, for example 15m or 7d.");
  const unit = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[
    match[2]
  ];
  return Number(match[1]) * unit;
}

export function accessExpiry() {
  return process.env.AccessTokenExpiresIn || "15m";
}

export function refreshExpiry() {
  return process.env.RefreshTokenExpiresIn || "7d";
}

export function cookieOptions(maxAge) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  };
  if (maxAge !== undefined) options.maxAge = maxAge;
  return options;
}
