import { ApiError } from "./apiError.js";

// Approximate area centres for the MVP map; these are not live GPS positions.
export const areas = {
  Banani: [23.7937, 90.4066],
  "Gulshan 1": [23.7808, 90.4168],
  Mohakhali: [23.7776, 90.4043],
  Dhanmondi: [23.7461, 90.3742],
  Mirpur: [23.8223, 90.3654],
  Uttara: [23.8759, 90.3795],
  Farmgate: [23.7584, 90.3905],
  Bashundhara: [23.8132, 90.4255],
};

const corridors = [
  ["Banani", "Gulshan 1", "Mohakhali", "Bashundhara"],
  ["Dhanmondi", "Farmgate", "Mohakhali"],
  ["Mirpur", "Farmgate", "Uttara"],
];

export function requireArea(value) {
  if (typeof value !== "string" || !Object.hasOwn(areas, value)) throw new ApiError(400, "Choose a listed Dhaka area.");
  return value;
}

export function compatibleRoutes(first, second) {
  return first.pickupArea === second.pickupArea && corridors.some((corridor) =>
    corridor.includes(first.pickupArea) && corridor.includes(first.destinationArea) && corridor.includes(second.destinationArea)
  );
}

export function fareQuote(pickupArea, destinationArea, seats) {
  requireArea(pickupArea);
  requireArea(destinationArea);
  if (pickupArea === destinationArea) throw new ApiError(400, "Pickup and destination must differ.");
  if (!Number.isInteger(seats) || seats < 1 || seats > 4) throw new ApiError(400, "Request 1 to 4 seats.");
  const [aLat, aLng] = areas[pickupArea];
  const [bLat, bLng] = areas[destinationArea];
  const approximateKm = Math.max(1, Math.round(Math.hypot((aLat - bLat) * 111, (aLng - bLng) * 102)));
  const soloFarePaisa = (5000 + approximateKm * 2000) * seats;
  return { approximateKm, soloFarePaisa, pooledFarePaisa: Math.round(soloFarePaisa * 0.8) };
}
