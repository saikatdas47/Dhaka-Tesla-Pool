import FareSettings from "../models/FareSettings.js";

export const defaultFareSettings = Object.freeze({
  baseFarePaisa: 5000,
  perKmPaisa: 2000,
  sharedDiscountPercent: 20,
  discountBpsPerKm2: 150,
  discountBpsPerKm3: 200,
  discountBpsPerKm4: 250,
  maxDiscountBps: 3000,
});

export async function seedFareSettings() {
  // Insert once; restarting never overwrites the Admin's saved rates.
  const saved = await FareSettings.findOneAndUpdate(
    { _id: "current" },
    { $setOnInsert: defaultFareSettings },
    { upsert: true, runValidators: true, returnDocument: "after" },
  );
  // Backfill new fields on older settings without changing existing values.
  for (const key of [
    "discountBpsPerKm2",
    "discountBpsPerKm3",
    "discountBpsPerKm4",
    "maxDiscountBps",
  ]) {
    await FareSettings.updateOne(
      { _id: "current", [key]: { $exists: false } },
      { $set: { [key]: defaultFareSettings[key] } },
      { runValidators: true },
    );
  }
  return saved;
}

export async function getFareSettings() {
  const saved = await FareSettings.findById("current").lean();
  return saved
    ? {
        baseFarePaisa: saved.baseFarePaisa,
        perKmPaisa: saved.perKmPaisa,
        sharedDiscountPercent: saved.sharedDiscountPercent,
        discountBpsPerKm2: saved.discountBpsPerKm2 ?? 150,
        discountBpsPerKm3: saved.discountBpsPerKm3 ?? 200,
        discountBpsPerKm4: saved.discountBpsPerKm4 ?? 250,
        maxDiscountBps: saved.maxDiscountBps ?? 3000,
        updatedAt: saved.updatedAt,
        configured: true,
      }
    : { ...defaultFareSettings, updatedAt: null, configured: false };
}
