import test from "node:test";
import assert from "node:assert/strict";
import Driver from "../models/Driver.js";
import app from "../app.js";

test("only admin can review a pending driver", async () => {
  const oldUsername = process.env.ADMIN_USERNAME;
  const oldPassword = process.env.ADMIN_PASSWORD;
  const oldSecret = process.env.AccessTokenSecret;
  const originalFind = Driver.find;
  const originalUpdate = Driver.findOneAndUpdate;
  process.env.ADMIN_USERNAME = "test_admin";
  process.env.ADMIN_PASSWORD = "test-admin-password-123456";
  process.env.AccessTokenSecret = "test-access-secret-longer-than-thirty-two-bytes";
  app.locals.databaseReady = true;
  const id = "507f1f77bcf86cd799439022";
  const driver = { id, name: "Driver 1", username: "driver_1", verificationStatus: "pending" };
  Driver.find = () => ({ sort: () => ({ limit: async () => [driver] }) });
  Driver.findOneAndUpdate = async (filter, update) => {
    if (filter._id !== id || driver.verificationStatus !== "pending") return null;
    driver.verificationStatus = update.$set.verificationStatus;
    return driver;
  };
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  try {
    const anonymous = await fetch(`${base}/drivers/${id}/verification`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
    assert.equal(anonymous.status, 401);
    const wrong = await fetch(`${base}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "test_admin", password: "wrong" }) });
    assert.equal(wrong.status, 401);
    const login = await fetch(`${base}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "test_admin", password: "test-admin-password-123456" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().find((value) => value.startsWith("tesla_pool_admin_session=")).split(";")[0];
    const pending = await fetch(`${base}/drivers/pending`, { headers: { Cookie: cookie } });
    assert.equal((await pending.json()).data.drivers.length, 1);
    const approved = await fetch(`${base}/drivers/${id}/verification`, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ status: "approved" }) });
    assert.equal(approved.status, 200);
    assert.equal(driver.verificationStatus, "approved");
    const repeat = await fetch(`${base}/drivers/${id}/verification`, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ status: "rejected" }) });
    assert.equal(repeat.status, 409);
  } finally {
    Driver.find = originalFind;
    Driver.findOneAndUpdate = originalUpdate;
    if (oldUsername === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = oldUsername;
    if (oldPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = oldPassword;
    if (oldSecret === undefined) delete process.env.AccessTokenSecret; else process.env.AccessTokenSecret = oldSecret;
    await new Promise((resolve) => server.close(resolve));
  }
});
