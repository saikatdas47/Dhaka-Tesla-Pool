import LiveFare from "../models/LiveFare.js";
import RideRequest from "../models/RideRequest.js";

// Booked seats count even when all seats belong to one booking.
export function segmentDiscountBps(km, seats, rule) {
  if (seats < 2) return 0;
  return km * (rule["discountBpsPerKm" + Math.min(seats, 4)] || 0);
}
export function discountedFare(solo, discountBps, capBps) {
  return Math.round((solo * (10000 - Math.min(discountBps, capBps))) / 10000);
}

// Rebuild the visible price sequence from permanent travelled-edge records.
// Repeated prices (solo edges or a reached cap) do not add crossed-out entries.
export function fareSteps(ride) {
  if (ride.estimateHistoryPaisa?.length) return [...ride.estimateHistoryPaisa];
  const steps = [ride.soloFarePaisa];
  let earnedBps = 0;
  for (const part of ride.fareBreakdown || []) {
    if (part.discountBps == null) continue;
    earnedBps += part.discountBps;
    const amount = discountedFare(
      ride.soloFarePaisa,
      earnedBps,
      ride.fareRule.maxDiscountBps,
    );
    if (amount !== steps.at(-1)) steps.push(amount);
  }
  const current = ride.finalFarePaisa ?? ride.currentEstimatePaisa;
  if (current != null && current !== steps.at(-1)) steps.push(current);
  return steps;
}

export function projectedDiscountBps(pool, ride, rides) {
  let bps = ride.fareBreakdown.reduce(
    (sum, part) => sum + (part.discountBps || 0),
    0,
  );
  if (ride.status !== "STARTED") return bps;
  for (
    let index = Math.max(pool.currentStopIndex, ride.pickupIndex);
    index < ride.destinationIndex;
    index++
  ) {
    const seats = rides
      .filter(
        (item) =>
          item.status === "STARTED" &&
          item.pickupIndex <= index &&
          item.destinationIndex > index,
      )
      .reduce((sum, item) => sum + item.seats, 0);
    bps += segmentDiscountBps(pool.segmentKm[index], seats, pool.fareRule);
  }
  return bps;
}

// Allocate integer paisa by seats. Remainders go to highest fractional shares,
// with ride ID as a stable tie-breaker; allocated amounts sum exactly to cost.
export function splitSegment(cost, riders) {
  const totalSeats = riders.reduce((sum, rider) => sum + rider.seats, 0);
  if (!totalSeats) return [];
  const charges = riders.map((rider) => ({
    ride: String(rider.id),
    paisa: Math.floor((cost * rider.seats) / totalSeats),
    remainder: (cost * rider.seats) % totalSeats,
  }));
  charges.sort(
    (a, b) => b.remainder - a.remainder || a.ride.localeCompare(b.ride),
  );
  let left = cost - charges.reduce((sum, charge) => sum + charge.paisa, 0);
  for (let index = 0; index < left; index++) charges[index].paisa++;
  return charges.map(({ ride, paisa }) => ({ ride, paisa }));
}

export async function settleTravel(pool, target, session) {
  if (!pool.fareMode) return;
  let ledger = await LiveFare.findOne({ pool: pool.id }).session(session);
  if (!ledger)
    [ledger] = await LiveFare.create([{ pool: pool.id, driver: pool.driver }], {
      session,
    });
  const rides = await RideRequest.find({ pool: pool.id }).session(session);
  for (let index = ledger.settledThrough; index < target; index++) {
    const onboard = rides.filter(
      (ride) =>
        ride.status === "STARTED" &&
        ride.pickupIndex <= index &&
        ride.destinationIndex > index,
    );
    const cost = Math.round(pool.segmentKm[index] * pool.fareRule.perKmPaisa);
    if (pool.fareMode === "shared-km") {
      const seats = onboard.reduce((sum, ride) => sum + ride.seats, 0);
      const discountBps = segmentDiscountBps(
        pool.segmentKm[index],
        seats,
        pool.fareRule,
      );
      ledger.segments.push({ index, occupiedSeats: seats, charges: [] });
      for (const ride of onboard) {
        ride.fareBreakdown.push({
          from: pool.routeStops[index],
          to: pool.routeStops[index + 1],
          km: pool.segmentKm[index],
          occupiedSeats: seats,
          discountBps,
        });
        await ride.save({ session });
      }
      continue;
    }
    const charges = splitSegment(cost, onboard);
    ledger.segments.push({
      index,
      occupiedSeats: onboard.reduce((sum, ride) => sum + ride.seats, 0),
      charges,
    });
    for (const charge of charges) {
      const ride = rides.find((item) => item.id === charge.ride);
      ride.fareBreakdown.push({
        from: pool.routeStops[index],
        to: pool.routeStops[index + 1],
        km: pool.segmentKm[index],
        paisa: charge.paisa,
      });
      await ride.save({ session });
    }
  }
  ledger.settledThrough = target;
  await ledger.save({ session });
}

export async function refreshFareEstimates(pool, session) {
  if (!pool.fareMode) return;
  const rides = await RideRequest.find({ pool: pool.id }).session(session);
  for (const ride of rides) {
    if (["COMPLETED", "CANCELLED"].includes(ride.status)) continue;
    if (pool.fareMode === "shared-km") {
      // Forecast only currently onboard seats until their assigned drop-offs.
      // Travelled charges remain frozen; future pickups are not assumed.
      const bps = projectedDiscountBps(pool, ride, rides);
      const estimate = discountedFare(
        ride.soloFarePaisa,
        bps,
        pool.fareRule.maxDiscountBps,
      );
      if (ride.currentEstimatePaisa !== estimate) {
        if (!ride.estimateHistoryPaisa.length)
          ride.estimateHistoryPaisa.push(ride.soloFarePaisa);
        if (ride.estimateHistoryPaisa.at(-1) !== estimate)
          ride.estimateHistoryPaisa.push(estimate);
        ride.previousEstimatePaisa =
          ride.currentEstimatePaisa ?? ride.soloFarePaisa;
        ride.currentEstimatePaisa = estimate;
        await ride.save({ session });
      }
      continue;
    }
    let estimate = pool.fareRule.baseFarePaisa * ride.seats;
    estimate += ride.fareBreakdown.reduce((sum, part) => sum + part.paisa, 0);
    for (
      let index = Math.max(pool.currentStopIndex, ride.pickupIndex);
      index < ride.destinationIndex;
      index++
    ) {
      const onboard =
        ride.status === "STARTED"
          ? rides.filter(
              (item) =>
                item.status === "STARTED" &&
                item.pickupIndex <= index &&
                item.destinationIndex > index,
            )
          : [];
      if (!onboard.some((item) => item.id === ride.id)) onboard.push(ride);
      const charges = splitSegment(
        Math.round(pool.segmentKm[index] * pool.fareRule.perKmPaisa),
        onboard,
      );
      estimate += charges.find((charge) => charge.ride === ride.id).paisa;
    }
    if (ride.currentEstimatePaisa !== estimate) {
      ride.previousEstimatePaisa =
        ride.currentEstimatePaisa ?? ride.soloFarePaisa;
      ride.currentEstimatePaisa = estimate;
      await ride.save({ session });
    }
  }
  if (["COMPLETED", "CANCELLED"].includes(pool.status))
    await LiveFare.deleteOne({ pool: pool.id }, { session });
}
