import { ApiError } from "./apiError.js";
import { defaultFareSettings } from "../services/fareSettingsService.js";

// Fixed demo geography. Distances are assumptions, not live road measurements.
export const areas = {
  Dhanmondi: [23.7461, 90.3742],
  Farmgate: [23.7584, 90.3905],
  Mohakhali: [23.7776, 90.4043],
  "Gulshan 1": [23.7808, 90.4168],
  Banani: [23.7937, 90.4066],
  Bashundhara: [23.8132, 90.4255],
  Mirpur: [23.8223, 90.3654],
  Agargaon: [23.7785, 90.38],
  Uttara: [23.8759, 90.3795],
  Motijheel: [23.733, 90.417],
  Shahbag: [23.738, 90.395],
};
export const edges = [
  { from: "Dhanmondi", to: "Farmgate", km: 3 },
  { from: "Farmgate", to: "Mohakhali", km: 3 },
  { from: "Mohakhali", to: "Gulshan 1", km: 2 },
  { from: "Gulshan 1", to: "Banani", km: 2 },
  { from: "Banani", to: "Bashundhara", km: 4 },
  { from: "Mirpur", to: "Agargaon", km: 4 },
  { from: "Agargaon", to: "Farmgate", km: 3 },
  { from: "Banani", to: "Uttara", km: 8 },
  { from: "Farmgate", to: "Shahbag", km: 3 },
  { from: "Shahbag", to: "Motijheel", km: 3 },
];
export function requireArea(value) {
  if (typeof value !== "string" || !Object.hasOwn(areas, value))
    throw new ApiError(400, "Choose a listed Dhaka area.");
  return value;
}
export function edgeDistance(from, to) {
  const edge = edges.find(
    (item) =>
      (item.from === from && item.to === to) ||
      (item.from === to && item.to === from),
  );
  if (!edge) throw new ApiError(400, "These areas are not directly connected.");
  return edge.km;
}

// BFS finds the unique path in our tree. Distances are summed afterwards.
// Keep this function name for callers; BFS does not minimize weighted distance.
export function shortestPath(start, end, graphEdges = edges) {
  requireArea(start);
  requireArea(end);
  const neighbours = {};
  for (const node of Object.keys(areas)) neighbours[node] = [];
  for (const edge of graphEdges) {
    if (
      !neighbours[edge.from] ||
      !neighbours[edge.to] ||
      !Number.isFinite(edge.km) ||
      edge.km <= 0
    )
      throw new ApiError(
        400,
        "Graph edges need listed nodes and positive distances.",
      );
    neighbours[edge.from].push({ node: edge.to, km: edge.km });
    neighbours[edge.to].push({ node: edge.from, km: edge.km });
  }
  const queue = [start];
  const visited = new Set([start]);
  const previous = {};
  const incomingKm = {};
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === end) break;
    for (const neighbour of neighbours[current]) {
      if (visited.has(neighbour.node)) continue;
      visited.add(neighbour.node);
      previous[neighbour.node] = current;
      incomingKm[neighbour.node] = neighbour.km;
      queue.push(neighbour.node);
    }
  }
  if (!visited.has(end))
    throw new ApiError(400, "No path connects these areas.");
  const stops = [];
  const segmentKm = [];
  let node = end;
  while (node !== start) {
    stops.push(node);
    segmentKm.push(incomingKm[node]);
    node = previous[node];
  }
  stops.push(start);
  stops.reverse();
  segmentKm.reverse();
  const approximateKm = segmentKm.reduce((sum, km) => sum + km, 0);
  return { routeStops: stops, segmentKm, approximateKm };
}

export function rideIndexes(trip, ride) {
  const pickup = trip.routeStops.indexOf(ride.pickupArea);
  const destination = trip.routeStops.indexOf(ride.destinationArea);
  if (pickup < 0 || destination <= pickup) return null;
  return { pickup, destination };
}

// Return a candidate route, or null. Never mutate the actual pool in a preview.
export function planBooking(pool, currentArea, ride) {
  const pickup = pool.routeStops.indexOf(ride.pickupArea);
  const current = pool.routeStops.indexOf(currentArea);
  if (current < 0 || pickup < current) return null;
  let routeStops = [...pool.routeStops];
  let segmentKm = [...pool.segmentKm];
  const destination = routeStops.indexOf(ride.destinationArea);
  if (destination >= 0) {
    if (destination <= pickup) return null; // No reversal.
  } else {
    const candidate = shortestPath(ride.pickupArea, ride.destinationArea);
    const remaining = routeStops.slice(pickup);
    for (let index = 0; index < remaining.length; index++) {
      if (candidate.routeStops[index] !== remaining[index]) return null;
    }
    const extension = candidate.routeStops.slice(remaining.length);
    for (const area of extension) if (routeStops.includes(area)) return null;
    routeStops = routeStops.concat(extension);
    segmentKm = [];
    for (let index = 0; index < routeStops.length - 1; index++)
      segmentKm.push(edgeDistance(routeStops[index], routeStops[index + 1]));
  }
  const segmentSeats = [...pool.segmentSeats];
  while (segmentSeats.length < segmentKm.length) segmentSeats.push(0);
  const plan = {
    routeStops,
    segmentKm,
    segmentSeats,
    capacity: pool.capacity,
    endIndex: routeStops.length - 1,
  };
  const indexes = rideIndexes(plan, ride);
  if (!indexes) return null;
  for (let index = indexes.pickup; index < indexes.destination; index++) {
    if (segmentSeats[index] + ride.seats > pool.capacity) return null;
  }
  const extensionStops = routeStops.slice(pool.routeStops.length);
  let addedKm = 0;
  for (let index = pool.segmentKm.length; index < segmentKm.length; index++)
    addedKm += segmentKm[index];
  return { ...plan, ...indexes, extensionStops, addedKm };
}
export function reserveSeats(trip, ride, change = 1) {
  const indexes = rideIndexes(trip, ride);
  if (!indexes) throw new ApiError(409, "Ride does not follow this trip path.");
  const seats = [...trip.segmentSeats];
  for (let index = indexes.pickup; index < indexes.destination; index++)
    seats[index] += change * ride.seats;
  return seats;
}
export function priceForDistance(approximateKm, seats, settings) {
  const soloFarePaisa =
    (settings.baseFarePaisa + approximateKm * settings.perKmPaisa) * seats;
  return {
    approximateKm,
    soloFarePaisa,
    pooledFarePaisa: Math.round(
      (soloFarePaisa * (100 - settings.sharedDiscountPercent)) / 100,
    ),
    fareRule: {
      baseFarePaisa: settings.baseFarePaisa,
      perKmPaisa: settings.perKmPaisa,
      sharedDiscountPercent: settings.sharedDiscountPercent,
    },
  };
}
export function fareQuote(
  pickupArea,
  destinationArea,
  seats,
  settings = defaultFareSettings,
) {
  if (pickupArea === destinationArea)
    throw new ApiError(400, "Pickup and destination must differ.");
  if (!Number.isInteger(seats) || seats < 1 || seats > 4)
    throw new ApiError(400, "Request 1 to 4 seats.");
  const path = shortestPath(pickupArea, destinationArea);
  return {
    routeCode: "graph-v1",
    ...path,
    pickupIndex: 0,
    destinationIndex: path.routeStops.length - 1,
    ...priceForDistance(path.approximateKm, seats, settings),
  };
}
export function hasSharedSegment(pool, ride) {
  for (const member of pool.members) {
    if (
      String(member.request) === String(ride.id) ||
      member.status === "CANCELLED"
    )
      continue;
    if (
      member.pickupIndex < ride.destinationIndex &&
      ride.pickupIndex < member.destinationIndex
    )
      return true;
  }
  return false;
}
