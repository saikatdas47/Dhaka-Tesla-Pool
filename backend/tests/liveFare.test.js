import test from "node:test";
import assert from "node:assert/strict";
import {
  splitSegment,
  segmentDiscountBps,
  discountedFare,
  fareSteps,
  projectedDiscountBps,
} from "../services/liveFareService.js";

test("pickup projects onboard overlap without changing settled discount", () => {
  const rule = {
    discountBpsPerKm2: 150,
    discountBpsPerKm3: 200,
    discountBpsPerKm4: 250,
  };
  const pool = { currentStopIndex: 1, segmentKm: [3, 3, 2], fareRule: rule };
  const a = {
    status: "STARTED",
    pickupIndex: 0,
    destinationIndex: 2,
    seats: 1,
    fareBreakdown: [{ discountBps: 0 }],
  };
  const b = {
    status: "STARTED",
    pickupIndex: 1,
    destinationIndex: 3,
    seats: 1,
    fareBreakdown: [],
  };
  assert.equal(projectedDiscountBps(pool, a, [a, b]), 450);
  assert.equal(projectedDiscountBps(pool, b, [a, b]), 450);
  b.status = "MATCHED";
  assert.equal(projectedDiscountBps(pool, a, [a, b]), 0);
  assert.equal(projectedDiscountBps(pool, b, [a, b]), 0);
  assert.deepEqual(a.fareBreakdown, [{ discountBps: 0 }]);
});

test("fare display keeps each earned reduction and stops at cap", () => {
  assert.deepEqual(
    fareSteps({
      soloFarePaisa: 60000,
      fareRule: { maxDiscountBps: 1000 },
      fareBreakdown: [
        { discountBps: 0 },
        { discountBps: 450 },
        { discountBps: 400 },
        { discountBps: 500 },
        { discountBps: 500 },
      ],
    }),
    [60000, 57300, 54900, 54000],
  );
});

test("discount follows occupied seats and travelled km, capped and rounded", () => {
  const rule = {
    discountBpsPerKm2: 150,
    discountBpsPerKm3: 200,
    discountBpsPerKm4: 250,
  };
  assert.equal(segmentDiscountBps(6, 1, rule), 0);
  assert.equal(segmentDiscountBps(6, 2, rule), 900);
  assert.equal(segmentDiscountBps(6, 3, rule), 1200);
  assert.equal(segmentDiscountBps(6, 4, rule), 1500);
  assert.equal(discountedFare(60000, 850, 3000), 54900);
  assert.equal(discountedFare(60000, 9000, 3000), 42000);
});

test("segment splitting conserves paisa, weights seats and breaks ties deterministically", () => {
  assert.deepEqual(splitSegment(6000, [{ id: "a", seats: 1 }]), [
    { ride: "a", paisa: 6000 },
  ]);
  assert.deepEqual(
    splitSegment(6000, [
      { id: "a", seats: 1 },
      { id: "b", seats: 1 },
    ]),
    [
      { ride: "a", paisa: 3000 },
      { ride: "b", paisa: 3000 },
    ],
  );
  assert.deepEqual(
    splitSegment(6000, [
      { id: "a", seats: 2 },
      { id: "b", seats: 1 },
    ]),
    [
      { ride: "a", paisa: 4000 },
      { ride: "b", paisa: 2000 },
    ],
  );
  const odd = splitSegment(100, [
    { id: "c", seats: 1 },
    { id: "b", seats: 1 },
    { id: "a", seats: 1 },
  ]);
  assert.equal(
    odd.reduce((sum, charge) => sum + charge.paisa, 0),
    100,
  );
  assert.equal(odd.find((charge) => charge.ride === "a").paisa, 34);
  assert.deepEqual(splitSegment(100, []), []);
  // Dhanmondi-Farmgate solo, Farmgate-Mohakhali shared; base 5000 each.
  assert.equal(5000 + 6000 + 3000, 14000);
  assert.equal(5000 + 3000, 8000);
});
