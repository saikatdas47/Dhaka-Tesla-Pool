import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../app.js";

test("frontend stays available while database APIs report temporary outage", async () => {
  app.locals.databaseReady = false;
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const backendDirectory = path.dirname(fileURLToPath(new URL("../app.js", import.meta.url)));
    if (existsSync(path.join(backendDirectory, "public", "index.html"))) {
      const page = await fetch(`${base}/login/passenger`);
      assert.equal(page.status, 200);
    }
    const api = await fetch(`${base}/api/passengers/me`);
    assert.equal(api.status, 503);
    assert.match((await api.json()).message, /database.*unavailable/i);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
