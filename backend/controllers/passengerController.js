import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Passenger from "../models/Passenger.js";

const cookieName = "tesla_pool_session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
};

function publicPassenger(passenger) {
  return { id: passenger.id, name: passenger.name, email: passenger.email };
}

function setSession(response, passenger) {
  const token = jwt.sign({ sub: passenger.id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
  response.cookie(cookieName, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

async function currentPassenger(request) {
  const token = request.cookies?.[cookieName];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  return Passenger.findById(payload.sub);
}

export async function registerPassenger(request, response, next) {
  try {
    const { name, email, password } = request.body ?? {};
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return response.status(400).json({ message: "Name must be 2 to 80 characters." });
    }
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return response.status(400).json({ message: "Enter a valid email address." });
    }
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) {
      return response.status(400).json({ message: "Password must be at least 8 characters and at most 72 bytes." });
    }

    const existing = await Passenger.exists({ email: normalizedEmail });
    if (existing) {
      return response.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const passenger = await Passenger.create({ name: normalizedName, email: normalizedEmail, passwordHash });
    setSession(response, passenger);
    response.status(201).json({ passenger: publicPassenger(passenger) });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ message: "An account with this email already exists." });
    }
    next(error);
  }
}

export async function loginPassenger(request, response, next) {
  try {
    const { email, password } = request.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || typeof password !== "string") {
      return response.status(400).json({ message: "Email and password are required." });
    }

    const passenger = await Passenger.findOne({ email: normalizedEmail }).select("+passwordHash");
    const valid = passenger && (await bcrypt.compare(password, passenger.passwordHash));
    if (!valid) {
      return response.status(401).json({ message: "Email or password is incorrect." });
    }

    setSession(response, passenger);
    response.json({ passenger: publicPassenger(passenger) });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentPassenger(request, response, next) {
  try {
    const passenger = await currentPassenger(request);
    if (!passenger) return response.status(401).json({ message: "Please log in." });
    response.json({ passenger: publicPassenger(passenger) });
  } catch (error) {
    next(error);
  }
}

export function logoutPassenger(_request, response) {
  response.clearCookie(cookieName, cookieOptions);
  response.json({ message: "Logged out." });
}
