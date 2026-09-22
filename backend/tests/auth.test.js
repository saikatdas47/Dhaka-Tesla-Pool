import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import Passenger from "../models/Passenger.js";
import passengerRoutes from "../routes/passengerRoutes.js";

process.env.JWT_SECRET = "test-only-secret-longer-than-thirty-two-bytes";

function testServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/passengers", passengerRoutes);
  return app.listen(0, "127.0.0.1");
}

async function request(server, path, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/passengers${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  return { response, body: await response.json() };
}

test("registration, duplicate account, login, session, and logout", async () => {
  const originals = {
    exists: Passenger.exists,
    create: Passenger.create,
    findOne: Passenger.findOne,
    findById: Passenger.findById,
  };
  const server = testServer();
  await new Promise((resolve) => server.once("listening", resolve));
  const fakePassenger = {
    id: "507f1f77bcf86cd799439011",
    name: "Nusrat Rahman",
    email: "nusrat@example.com",
  };
  let savedHash;
  let savedEmail;

  try {
    Passenger.exists = async ({ email }) => email === savedEmail;
    Passenger.create = async (data) => {
      savedEmail = data.email;
      savedHash = data.passwordHash;
      return fakePassenger;
    };
    Passenger.findOne = ({ email }) => ({
      select: async () => email === savedEmail ? { ...fakePassenger, passwordHash: savedHash } : null,
    });
    Passenger.findById = async (id) => id === fakePassenger.id ? fakePassenger : null;

    const invalid = await request(server, "/register", {
      method: "POST",
      body: JSON.stringify({ name: "N", email: "bad", password: "short" }),
    });
    assert.equal(invalid.response.status, 400);

    const registered = await request(server, "/register", {
      method: "POST",
      body: JSON.stringify({ name: fakePassenger.name, email: "NUSRAT@example.com", password: "strong-password" }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.passenger.email, fakePassenger.email);
    assert.equal(registered.body.passenger.passwordHash, undefined);
    assert.equal(savedEmail, fakePassenger.email);
    assert.notEqual(savedHash, "strong-password");
    assert.equal(await bcrypt.compare("strong-password", savedHash), true);
    const registerCookie = registered.response.headers.get("set-cookie");
    assert.match(registerCookie, /HttpOnly/);
    assert.match(registerCookie, /SameSite=Lax/);

    const duplicate = await request(server, "/register", {
      method: "POST",
      body: JSON.stringify({ name: fakePassenger.name, email: fakePassenger.email, password: "strong-password" }),
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
    const sessionCookie = loggedIn.response.headers.get("set-cookie").split(";")[0];

    const anonymous = await request(server, "/me");
    assert.equal(anonymous.response.status, 401);
    const current = await request(server, "/me", { headers: { Cookie: sessionCookie } });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.passenger.name, fakePassenger.name);

    const loggedOut = await request(server, "/logout", { method: "POST", headers: { Cookie: sessionCookie } });
    assert.equal(loggedOut.response.status, 200);
    assert.match(loggedOut.response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  } finally {
    Object.assign(Passenger, originals);
    await new Promise((resolve) => server.close(resolve));
  }
});
