import test from "node:test";
import assert from "node:assert/strict";
import {
  areas,
  compatibleRoutes,
  fareQuote,
  requireArea,
} from "../utils/rideRules.js";

test("Dhaka zones, fare and compatible shared routes", () => {
  assert.equal(Object.keys(areas).length, 8);
  assert.equal(requireArea("Banani"), "Banani");
  assert.throws(() => requireArea("Unknown"));
  const nusrat = fareQuote("Banani", "Mohakhali", 1);
  const rafiq = fareQuote("Banani", "Gulshan 1", 1);
  assert.equal(nusrat.pooledFarePaisa, Math.round(nusrat.soloFarePaisa * 0.8));
  assert.equal(rafiq.pooledFarePaisa, Math.round(rafiq.soloFarePaisa * 0.8));
  const custom = fareQuote("Banani", "Mohakhali", 2, {
    baseFarePaisa: 6000,
    perKmPaisa: 2500,
    sharedDiscountPercent: 25,
  });
  assert.equal(custom.soloFarePaisa, 22000);
  assert.equal(custom.pooledFarePaisa, 16500);
  assert.deepEqual(custom.fareRule, {
    baseFarePaisa: 6000,
    perKmPaisa: 2500,
    sharedDiscountPercent: 25,
  });
  assert.equal(
    compatibleRoutes(
      { pickupArea: "Banani", destinationArea: "Mohakhali" },
      { pickupArea: "Banani", destinationArea: "Gulshan 1" },
    ),
    true,
  );
  assert.equal(
    compatibleRoutes(
      { pickupArea: "Banani", destinationArea: "Mohakhali" },
      { pickupArea: "Mirpur", destinationArea: "Uttara" },
    ),
    false,
  );
  assert.throws(() => fareQuote("Banani", "Banani", 1));
  assert.throws(() => fareQuote("Banani", "Mohakhali", 5));
});
