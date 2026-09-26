import test from "node:test";
import assert from "node:assert/strict";
import {
  areas,
  edges,
  shortestPath,
  planBooking,
  reserveSeats,
  fareQuote,
  requireArea,
  hasSharedSegment,
} from "../utils/rideRules.js";

function pool(start, end, capacity = 3) {
  const path = shortestPath(start, end);
  return { ...path, capacity, segmentSeats: path.segmentKm.map(() => 0) };
}
test("BFS connects every area pair with deterministic tree paths", () => {
  assert.equal(Object.keys(areas).length, 11);
  assert.deepEqual(shortestPath("Dhanmondi", "Motijheel").routeStops, [
    "Dhanmondi",
    "Farmgate",
    "Shahbag",
    "Motijheel",
  ]);
  assert.equal(shortestPath("Dhanmondi", "Motijheel").approximateKm, 9);
  assert.deepEqual(shortestPath("Mirpur", "Mohakhali").routeStops, [
    "Mirpur",
    "Agargaon",
    "Farmgate",
    "Mohakhali",
  ]);
  for (const start of Object.keys(areas))
    for (const end of Object.keys(areas)) {
      const path = shortestPath(start, end);
      assert.equal(path.routeStops[0], start);
      assert.equal(path.routeStops.at(-1), end);
      assert.equal(new Set(path.routeStops).size, path.routeStops.length);
      assert.equal(
        path.segmentKm.reduce((sum, km) => sum + km, 0),
        path.approximateKm,
      );
      assert.deepEqual(shortestPath(start, end), path);
    }
  assert.ok(edges.every((edge) => edge.km > 0));
  const cyclic = [...edges, { from: "Dhanmondi", to: "Motijheel", km: 20 }];
  // BFS chooses fewer edges, not lower weighted distance in a cyclic graph.
  assert.equal(
    shortestPath("Dhanmondi", "Motijheel", cyclic).approximateKm,
    20,
  );
  assert.equal(edges.length, Object.keys(areas).length - 1);
  const tied = [...edges, { from: "Dhanmondi", to: "Motijheel", km: 9 }];
  assert.deepEqual(
    shortestPath("Dhanmondi", "Motijheel", tied),
    shortestPath("Dhanmondi", "Motijheel", tied),
  );
  assert.throws(() => shortestPath("Dhanmondi", "Motijheel", []), /No path/);
  assert.throws(
    () =>
      shortestPath("Dhanmondi", "Motijheel", [
        { from: "Dhanmondi", to: "Motijheel", km: -1 },
      ]),
    /positive/,
  );
  assert.throws(() => requireArea("Unknown"));
});

test("forward-prefix extension accepts Gulshan, rejects Mirpur branch and reverse pickup", () => {
  const trip = pool("Dhanmondi", "Mohakhali");
  const extend = planBooking(trip, "Dhanmondi", {
    pickupArea: "Farmgate",
    destinationArea: "Gulshan 1",
    seats: 1,
  });
  assert.deepEqual(extend.routeStops, [
    "Dhanmondi",
    "Farmgate",
    "Mohakhali",
    "Gulshan 1",
  ]);
  assert.equal(extend.addedKm, 2);
  assert.deepEqual(
    trip.routeStops,
    ["Dhanmondi", "Farmgate", "Mohakhali"],
    "Preview never mutates pool.",
  );
  assert.equal(
    planBooking(trip, "Dhanmondi", {
      pickupArea: "Farmgate",
      destinationArea: "Mirpur",
      seats: 1,
    }),
    null,
  );
  assert.equal(
    planBooking(pool("Dhanmondi", "Mirpur"), "Dhanmondi", {
      pickupArea: "Agargaon",
      destinationArea: "Mohakhali",
      seats: 1,
    }),
    null,
  );
  assert.equal(
    planBooking(trip, "Mohakhali", {
      pickupArea: "Farmgate",
      destinationArea: "Gulshan 1",
      seats: 1,
    }),
    null,
  );
  assert.equal(
    planBooking(trip, "Dhanmondi", {
      pickupArea: "Mohakhali",
      destinationArea: "Dhanmondi",
      seats: 1,
    }),
    null,
  );
});

test("segment capacity covers extension, future reservations and adjacent seat reuse", () => {
  const trip = pool("Mirpur", "Mohakhali");
  const early = {
    pickupArea: "Mirpur",
    destinationArea: "Mohakhali",
    seats: 3,
  };
  trip.segmentSeats = reserveSeats(trip, early);
  const late = planBooking(trip, "Mirpur", {
    pickupArea: "Mohakhali",
    destinationArea: "Bashundhara",
    seats: 3,
  });
  assert.ok(late);
  assert.deepEqual(late.segmentSeats, [3, 3, 3, 0, 0, 0]);
  assert.equal(
    planBooking(trip, "Mirpur", {
      pickupArea: "Farmgate",
      destinationArea: "Bashundhara",
      seats: 1,
    }),
    null,
  );
  trip.segmentSeats = reserveSeats(trip, early, -1);
  assert.deepEqual(trip.segmentSeats, [0, 0, 0]);
});

test("fare uses weighted shortest distance, snapshot rates and integer paisa", () => {
  const quote = fareQuote("Dhanmondi", "Motijheel", 1);
  assert.equal(quote.approximateKm, 9);
  assert.equal(quote.soloFarePaisa, 23000);
  assert.equal(quote.pooledFarePaisa, 18400);
  assert.equal(fareQuote("Banani", "Mohakhali", 1).soloFarePaisa, 13000);
  assert.equal(fareQuote("Mirpur", "Bashundhara", 1).approximateKm, 18);
  assert.throws(() => fareQuote("Banani", "Banani", 1));
  assert.throws(() => fareQuote("Banani", "Mohakhali", 1.5));
  const ride = { id: "a", pickupIndex: 0, destinationIndex: 3 };
  assert.equal(
    hasSharedSegment(
      { members: [{ request: "b", pickupIndex: 3, destinationIndex: 5 }] },
      ride,
    ),
    false,
  );
  assert.equal(
    hasSharedSegment(
      { members: [{ request: "b", pickupIndex: 2, destinationIndex: 5 }] },
      ride,
    ),
    true,
  );
  assert.equal(
    hasSharedSegment(
      {
        members: [
          {
            request: "b",
            pickupIndex: 2,
            destinationIndex: 5,
            status: "CANCELLED",
          },
        ],
      },
      ride,
    ),
    false,
  );
});
