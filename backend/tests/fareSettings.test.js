import test from "node:test";
import assert from "node:assert/strict";
import FareSettings from "../models/FareSettings.js";
import { seedFareSettings } from "../services/fareSettingsService.js";

test("default fare seed inserts once and preserves Admin rates", async () => {
  const original = FareSettings.findOneAndUpdate;
  const originalUpdate = FareSettings.updateOne;
  FareSettings.updateOne = async () => ({});
  let record;
  FareSettings.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(filter._id, "current");
    assert.equal(options.upsert, true);
    assert.equal(update.$set, undefined);
    if (!record) record = { ...update.$setOnInsert };
    return record;
  };
  try {
    await seedFareSettings();
    assert.equal(record.baseFarePaisa, 5000);
    assert.equal(record.perKmPaisa, 2000);
    record.baseFarePaisa = 7000;
    record.perKmPaisa = 2500;
    await seedFareSettings();
    assert.equal(record.baseFarePaisa, 7000);
    assert.equal(record.perKmPaisa, 2500);
  } finally {
    FareSettings.findOneAndUpdate = original;
    FareSettings.updateOne = originalUpdate;
  }
});
