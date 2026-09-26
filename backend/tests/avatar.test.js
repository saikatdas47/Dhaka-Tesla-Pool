import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";

test("failed avatar upload stays local and retry removes it after success", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "dtp-avatar-"));
  process.env.UPLOAD_DIR = tempDirectory;
  process.env.JWT_SECRET = "test-only-secret-longer-than-thirty-two-bytes";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";

  const [{ default: app }, { default: Passenger }, { v2: cloudinary }] =
    await Promise.all([
      import("../app.js"),
      import("../models/Passenger.js"),
      import("cloudinary"),
    ]);
  const originals = {
    findById: Passenger.findById,
    findOneAndUpdate: Passenger.findOneAndUpdate,
    updateOne: Passenger.updateOne,
    upload: cloudinary.uploader.upload,
    destroy: cloudinary.uploader.destroy,
  };
  const state = {
    id: "507f1f77bcf86cd799439011",
    name: "Nusrat Rahman",
    email: "nusrat@example.com",
    avatarUrl: null,
    avatarPublicId: null,
    pendingAvatarFilename: null,
  };
  app.locals.databaseReady = true;
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ sub: state.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  try {
    Passenger.findById = async (id) => (id === state.id ? { ...state } : null);
    Passenger.findOneAndUpdate = async (filter, update) => {
      if (
        filter._id !== state.id ||
        filter.pendingAvatarFilename !== state.pendingAvatarFilename
      )
        return null;
      Object.assign(state, update.$set);
      return { ...state };
    };
    Passenger.updateOne = async (_filter, update) => {
      Object.assign(state, update.$set);
      return { matchedCount: 1 };
    };
    cloudinary.uploader.upload = async () => {
      throw new Error("simulated Cloudinary outage");
    };

    const noToken = await fetch(`${base}/api/passengers/avatar/retry`, {
      method: "POST",
    });
    assert.equal(noToken.status, 401);

    const wrongType = new FormData();
    wrongType.append(
      "avatar",
      new Blob(["hello"], { type: "text/plain" }),
      "note.txt",
    );
    const rejectedType = await fetch(`${base}/api/passengers/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: wrongType,
    });
    assert.equal(rejectedType.status, 400);
    assert.deepEqual(await readdir(tempDirectory), []);

    const fakePng = new FormData();
    fakePng.append(
      "avatar",
      new Blob(["not an image"], { type: "image/png" }),
      "fake.png",
    );
    const rejectedContent = await fetch(`${base}/api/passengers/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fakePng,
    });
    assert.equal(rejectedContent.status, 400);
    assert.deepEqual(await readdir(tempDirectory), []);

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    );
    const body = new FormData();
    body.append("avatar", new Blob([png], { type: "image/png" }), "nusrat.png");
    const upload = await fetch(`${base}/api/passengers/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    assert.equal(upload.status, 502);
    assert.equal((await upload.json()).data.avatarPending, true);
    assert.equal((await readdir(tempDirectory)).length, 1);
    assert.ok(state.pendingAvatarFilename);

    cloudinary.uploader.upload = async () => ({
      secure_url: "https://res.cloudinary.com/example/image/upload/nusrat.png",
      public_id: `dhaka-tesla-pool/passengers/${state.id}`,
    });
    const retry = await fetch(`${base}/api/passengers/avatar/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(result.data.passenger.avatarPending, false);
    assert.equal(result.data.passenger.avatarUrl, state.avatarUrl);
    assert.deepEqual(await readdir(tempDirectory), []);

    const calls = [];
    cloudinary.uploader.destroy = async () => {
      calls.push("delete");
      return { result: "ok" };
    };
    cloudinary.uploader.upload = async () => {
      calls.push("upload");
      return {
        secure_url:
          "https://res.cloudinary.com/example/image/upload/replacement.png",
        public_id: `dhaka-tesla-pool/passengers/${state.id}`,
      };
    };
    const replacement = new FormData();
    replacement.append(
      "avatar",
      new Blob([png], { type: "image/png" }),
      "replacement.png",
    );
    const replaced = await fetch(`${base}/api/passengers/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: replacement,
    });
    assert.equal(replaced.status, 200);
    assert.deepEqual(calls, ["delete", "upload"]);

    cloudinary.uploader.destroy = async () => ({ result: "error" });
    const failedRemoval = await fetch(`${base}/api/passengers/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(failedRemoval.status, 502);
    assert.ok(state.avatarUrl);

    cloudinary.uploader.destroy = async () => ({ result: "ok" });
    const removed = await fetch(`${base}/api/passengers/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).data.passenger.avatarUrl, null);
    assert.equal(state.avatarPublicId, null);
  } finally {
    Passenger.findById = originals.findById;
    Passenger.findOneAndUpdate = originals.findOneAndUpdate;
    Passenger.updateOne = originals.updateOne;
    cloudinary.uploader.upload = originals.upload;
    cloudinary.uploader.destroy = originals.destroy;
    await new Promise((resolve) => server.close(resolve));
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
