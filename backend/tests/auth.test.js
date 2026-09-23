import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Passenger from "../models/Passenger.js";
import EmailOtp from "../models/EmailOtp.js";
import app from "../app.js";

process.env.JWT_SECRET = "test-only-secret-longer-than-thirty-two-bytes";
process.env.AccessTokenSecret = "test-access-secret-longer-than-thirty-two-bytes";
process.env.RefreshTokenSecret = "test-refresh-secret-longer-than-thirty-two-bytes";

function testServer() {
  app.locals.databaseReady = true;
  return app.listen(0, "127.0.0.1");
}

async function request(server, path, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/passengers${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json() };
}

test("registration, duplicate account, login, session, and logout", async () => {
  const originals = {
    exists: Passenger.exists,
    create: Passenger.create,
    findOne: Passenger.findOne,
    findById: Passenger.findById,
    findByIdAndUpdate: Passenger.findByIdAndUpdate,
    findOneAndUpdate: Passenger.findOneAndUpdate,
    updateOne: Passenger.updateOne,
    findOneAndDeleteOtp: EmailOtp.findOneAndDelete,
  };
  const server = testServer();
  await new Promise((resolve) => server.once("listening", resolve));
  const fakePassenger = new Passenger({
    _id: "507f1f77bcf86cd799439011",
    name: "Nusrat Rahman",
    username: "nusrat_rahman",
    email: "nusrat@example.com",
    phone: "01712345678",
  });
  let savedHash;
  let savedEmail;
  let refreshTokenHash;

  try {
    Passenger.exists = async ({ $or, email }) => Boolean(savedEmail) && (email === savedEmail || $or?.some((item) => item.email === savedEmail || item.username === fakePassenger.username));
    Passenger.create = async (data) => {
      savedEmail = data.email;
      savedHash = data.passwordHash;
      return fakePassenger;
    };
    Passenger.findOne = ({ $or }) => ({
      select: async () => Boolean(savedEmail) && $or.some((item) => item.email === savedEmail || item.username === fakePassenger.username) ? new Passenger({ ...fakePassenger.toObject(), passwordHash: savedHash }) : null,
    });
    Passenger.findById = async (id) => id === fakePassenger.id ? fakePassenger : null;
    Passenger.findByIdAndUpdate = async (id, update) => {
      if (id !== fakePassenger.id) return null;
      Object.assign(fakePassenger, update.$set);
      return fakePassenger;
    };
    Passenger.updateOne = async (_filter, update) => {
      refreshTokenHash = update.$set.refreshTokenHash;
      return { matchedCount: 1 };
    };
    Passenger.findOneAndUpdate = async (filter, update) => {
      if (filter.refreshTokenHash) {
        if (filter.refreshTokenHash !== refreshTokenHash) return null;
        refreshTokenHash = update.$set.refreshTokenHash;
        return fakePassenger;
      }
      fakePassenger.username = update.$set.username;
      return fakePassenger;
    };
    EmailOtp.findOneAndDelete = async ({ role, email }) => role === "passenger" && email === fakePassenger.email ? {} : null;

    const invalid = await request(server, "/register", {
      method: "POST",
      body: JSON.stringify({ name: "N", email: "bad", password: "short" }),
    });
    assert.equal(invalid.response.status, 400);

    const registered = await request(server, "/register", {
      method: "POST",
      body: JSON.stringify({ name: fakePassenger.name, username: fakePassenger.username, email: "NUSRAT@example.com", phone: fakePassenger.phone, password: "strong-password", registrationToken: "a".repeat(64) }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.data.passenger.email, fakePassenger.email);
    assert.equal(registered.body.data.passenger.phone, fakePassenger.phone);
    assert.equal(registered.body.data.passenger.passwordHash, undefined);
    assert.equal(savedEmail, fakePassenger.email);
    assert.notEqual(savedHash, "strong-password");
    assert.equal(await bcrypt.compare("strong-password", savedHash), true);
    const registerCookie = registered.response.headers.get("set-cookie");
    assert.match(registerCookie, /HttpOnly/);
    assert.match(registerCookie, /SameSite=Lax/);
    assert.ok(registered.body.data.accessToken);

    const duplicate = await request(server, "/register", {
      method: "POST",
      body: JSON.stringify({ name: fakePassenger.name, username: fakePassenger.username, email: fakePassenger.email, phone: fakePassenger.phone, password: "strong-password" }),
    });
    assert.equal(duplicate.response.status, 409);

    const wrongPassword = await request(server, "/login", {
      method: "POST",
      body: JSON.stringify({ email: fakePassenger.email, password: "wrong-password" }),
    });
    assert.equal(wrongPassword.response.status, 401);

    const loggedIn = await request(server, "/login", {
      method: "POST",
      body: JSON.stringify({ email: fakePassenger.email, password: "strong-password" }),
    });
    assert.equal(loggedIn.response.status, 200);
    const usernameLogin = await request(server, "/login", {
      method: "POST",
      body: JSON.stringify({ identity: fakePassenger.username, password: "strong-password" }),
    });
    assert.equal(usernameLogin.response.status, 200);
    const latestCookies = usernameLogin.response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const refreshCookie = latestCookies.split("; ").find((value) => value.startsWith("tesla_pool_passenger_refresh="));
    const refreshAsAccess = await request(server, "/me", { headers: { Authorization: `Bearer ${refreshCookie.split("=")[1]}` } });
    assert.equal(refreshAsAccess.response.status, 401);
    const refreshed = await request(server, "/refresh-token", { method: "POST", headers: { Cookie: latestCookies } });
    assert.equal(refreshed.response.status, 200);
    assert.ok(refreshed.body.data.accessToken);
    const rotatedCookies = refreshed.response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const reused = await request(server, "/refresh-token", { method: "POST", headers: { Cookie: latestCookies } });
    assert.equal(reused.response.status, 401);
    const sessionCookie = loggedIn.response.headers.getSetCookie().find((value) => value.startsWith("tesla_pool_session=")).split(";")[0];

    const anonymous = await request(server, "/me");
    assert.equal(anonymous.response.status, 401);
    const current = await request(server, "/me", { headers: { Cookie: sessionCookie } });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.data.passenger.name, fakePassenger.name);

    const edited = await request(server, "/me", { method: "PATCH", headers: { Cookie: sessionCookie }, body: JSON.stringify({ name: "Saikat Das" }) });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.data.passenger.name, "Saikat Das");
    const renamed = await request(server, "/me", { method: "PATCH", headers: { Cookie: sessionCookie }, body: JSON.stringify({ username: "saikat_passenger" }) });
    assert.equal(renamed.response.status, 400);
    const unverifiedEmail = await request(server, "/me", { method: "PATCH", headers: { Cookie: sessionCookie }, body: JSON.stringify({ email: "new@example.com" }) });
    assert.equal(unverifiedEmail.response.status, 400);

    const expiredToken = jwt.sign({ sub: fakePassenger.id }, process.env.JWT_SECRET, { expiresIn: -1 });
    const expired = await request(server, "/me", { headers: { Authorization: `Bearer ${expiredToken}` } });
    assert.equal(expired.response.status, 401);
    assert.match(expired.body.message, /expired/i);

    const driverToken = jwt.sign({ sub: fakePassenger.id, role: "driver" }, process.env.JWT_SECRET);
    const wrongRole = await request(server, "/me", { headers: { Authorization: `Bearer ${driverToken}` } });
    assert.equal(wrongRole.response.status, 401);

    const loggedOut = await request(server, "/logout", { method: "POST", headers: { Cookie: rotatedCookies } });
    assert.equal(loggedOut.response.status, 200);
    assert.match(loggedOut.response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
    const revoked = await request(server, "/refresh-token", { method: "POST", headers: { Cookie: rotatedCookies } });
    assert.equal(revoked.response.status, 401);
  } finally {
    Object.assign(Passenger, originals);
    EmailOtp.findOneAndDelete = originals.findOneAndDeleteOtp;
    await new Promise((resolve) => server.close(resolve));
  }
});
