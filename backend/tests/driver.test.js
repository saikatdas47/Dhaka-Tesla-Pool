import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Driver from "../models/Driver.js";
import Passenger from "../models/Passenger.js";
import EmailOtp from "../models/EmailOtp.js";
import Pool from "../models/Pool.js";
import app from "../app.js";

process.env.JWT_SECRET = "test-only-secret-longer-than-thirty-two-bytes";
process.env.AccessTokenSecret =
  "test-access-secret-longer-than-thirty-two-bytes";
process.env.RefreshTokenSecret =
  "test-refresh-secret-longer-than-thirty-two-bytes";

test("driver signup, role-separated login, username login and protected dashboard", async () => {
  const originals = {
    exists: Driver.exists,
    create: Driver.create,
    findOne: Driver.findOne,
    findById: Driver.findById,
    updateOne: Driver.updateOne,
    findOneAndUpdate: Driver.findOneAndUpdate,
    findByIdAndUpdate: Driver.findByIdAndUpdate,
    findOneAndDeleteOtp: EmailOtp.findOneAndDelete,
    passengerFindById: Passenger.findById,
    poolExists: Pool.exists,
  };
  app.locals.databaseReady = true;
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const fields = {
    name: "Nusrat Rahman",
    username: "nusrat_rahman",
    email: "nusrat@example.com", // A Passenger can independently have this email.
    password: "strong-password",
    phone: "01712345678",
    licenseNumber: "DHAKA-12345",
    licenseExpiry: "2035-12-31",
    vehicleModel: "Model 3",
    vehicleRegistrationNumber: "DHAKA METRO GA 1234",
    vehicleColor: "White",
    passengerSeats: 4,
    serviceArea: "Banani, Dhaka",
  };
  let saved;
  let refreshTokenHash;

  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    return { response, body: await response.json() };
  }

  try {
    Driver.exists = async (query) =>
      Boolean(saved) && (query.email === saved.email || Boolean(query.$or));
    Driver.create = async (data) => {
      saved = new Driver({ _id: "507f1f77bcf86cd799439022", ...data });
      return saved;
    };
    Driver.findOne = ({ $or }) => ({
      select: async () =>
        saved &&
        $or.some(
          (item) =>
            item.email === saved.email || item.username === saved.username,
        )
          ? saved
          : null,
    });
    Driver.findById = async (id) => (id === saved?.id ? saved : null);
    Driver.updateOne = async (_filter, update) => {
      refreshTokenHash = update.$set.refreshTokenHash;
      return { matchedCount: 1 };
    };
    Driver.findOneAndUpdate = async (filter, update) => {
      if (filter.refreshTokenHash !== refreshTokenHash) return null;
      refreshTokenHash = update.$set.refreshTokenHash;
      return saved;
    };
    Driver.findByIdAndUpdate = async (id, update) => {
      if (id !== saved.id) return null;
      Object.assign(saved, update.$set);
      return saved;
    };
    EmailOtp.findOneAndDelete = async ({ role, email }) =>
      role === "driver" && email === fields.email ? {} : null;
    Passenger.findById = async () => null;
    Pool.exists = async () => false;

    const invalid = await request("/api/drivers/register", {
      method: "POST",
      body: JSON.stringify({ ...fields, username: "bad name" }),
    });
    assert.equal(invalid.response.status, 400);

    const created = await request("/api/drivers/register", {
      method: "POST",
      body: JSON.stringify({ ...fields, registrationToken: "b".repeat(64) }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.data.driver.username, fields.username);
    assert.equal(created.body.data.driver.verificationStatus, "pending");
    assert.equal(created.body.data.driver.passwordHash, undefined);
    assert.equal(
      await bcrypt.compare(fields.password, saved.passwordHash),
      true,
    );
    const cookie = created.response.headers
      .getSetCookie()
      .find((value) => value.startsWith("tesla_pool_driver_session="))
      .split(";")[0];
    assert.match(cookie, /tesla_pool_driver_session=/);
    assert.ok(created.body.data.accessToken);

    const duplicate = await request("/api/drivers/register", {
      method: "POST",
      body: JSON.stringify(fields),
    });
    assert.equal(duplicate.response.status, 409);

    const emailLogin = await request("/api/drivers/login", {
      method: "POST",
      body: JSON.stringify({
        identity: fields.email,
        password: fields.password,
      }),
    });
    assert.equal(emailLogin.response.status, 200);
    const usernameLogin = await request("/api/drivers/login", {
      method: "POST",
      body: JSON.stringify({
        identity: fields.username,
        password: fields.password,
      }),
    });
    assert.equal(usernameLogin.response.status, 200);
    const latestCookies = usernameLogin.response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const refreshed = await request("/api/drivers/refresh-token", {
      method: "POST",
      headers: { Cookie: latestCookies },
    });
    assert.equal(refreshed.response.status, 200);
    const rotatedCookies = refreshed.response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const reused = await request("/api/drivers/refresh-token", {
      method: "POST",
      headers: { Cookie: latestCookies },
    });
    assert.equal(reused.response.status, 401);

    const current = await request("/api/drivers/me", {
      headers: { Cookie: cookie },
    });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.data.driver.vehicleModel, "Model 3");

    const edited = await request("/api/drivers/me", {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        name: "Saikat Das",
        phone: "01798765432",
        serviceArea: "Dhanmondi, Dhaka",
        vehicleModel: "Model Y",
        vehicleRegistrationNumber: "DHAKA METRO GA 5678",
        vehicleColor: "Blue",
        passengerSeats: 3,
      }),
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.data.driver.name, "Saikat Das");
    assert.equal(edited.body.data.driver.serviceArea, "Dhanmondi, Dhaka");
    assert.equal(edited.body.data.driver.phone, "01798765432");
    assert.equal(edited.body.data.driver.vehicleModel, "Model Y");
    assert.equal(
      edited.body.data.driver.vehicleRegistrationNumber,
      "DHAKA METRO GA 5678",
    );
    assert.equal(edited.body.data.driver.vehicleColor, "Blue");
    assert.equal(edited.body.data.driver.passengerSeats, 3);
    assert.equal(edited.body.data.driver.verificationStatus, "pending");
    const unapproved = await request("/api/drivers/me", {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: JSON.stringify({ email: "new@example.com" }),
    });
    assert.equal(unapproved.response.status, 400);

    const passengerPage = await request("/api/passengers/me", {
      headers: { Cookie: cookie },
    });
    assert.equal(passengerPage.response.status, 401);
    const passengerToken = jwt.sign(
      { sub: saved.id, role: "passenger" },
      process.env.JWT_SECRET,
    );
    const wrongRole = await request("/api/drivers/me", {
      headers: { Authorization: `Bearer ${passengerToken}` },
    });
    assert.equal(wrongRole.response.status, 401);

    const logout = await request("/api/drivers/logout", {
      method: "POST",
      headers: { Cookie: rotatedCookies },
    });
    assert.equal(logout.response.status, 200);
    const revoked = await request("/api/drivers/refresh-token", {
      method: "POST",
      headers: { Cookie: rotatedCookies },
    });
    assert.equal(revoked.response.status, 401);
  } finally {
    Driver.exists = originals.exists;
    Driver.create = originals.create;
    Driver.findOne = originals.findOne;
    Driver.findById = originals.findById;
    Driver.updateOne = originals.updateOne;
    Driver.findOneAndUpdate = originals.findOneAndUpdate;
    Driver.findByIdAndUpdate = originals.findByIdAndUpdate;
    EmailOtp.findOneAndDelete = originals.findOneAndDeleteOtp;
    Passenger.findById = originals.passengerFindById;
    Pool.exists = originals.poolExists;
    await new Promise((resolve) => server.close(resolve));
  }
});
