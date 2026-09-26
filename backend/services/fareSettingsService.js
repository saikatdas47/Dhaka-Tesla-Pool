import FareSettings from "../models/FareSettings.js";

export const defaultFareSettings = Object.freeze({
  baseFarePaisa: 5000,
  perKmPaisa: 2000,
  sharedDiscountPercent: 20,
});

export async function getFareSettings() {
  const saved = await FareSettings.findById("current").lean();
  return saved
    ? {
        baseFarePaisa: saved.baseFarePaisa,
        perKmPaisa: saved.perKmPaisa,
        sharedDiscountPercent: saved.sharedDiscountPercent,
        updatedAt: saved.updatedAt,
        configured: true,
      }
    : { ...defaultFareSettings, updatedAt: null, configured: false };
}
