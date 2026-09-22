import { Router } from "express";
import {
  registerPassenger,
  loginPassenger,
  getCurrentPassenger,
  logoutPassenger,
} from "../controllers/passengerController.js";

const router = Router();

router.post("/register", registerPassenger);
router.post("/login", loginPassenger);
router.get("/me", getCurrentPassenger);
router.post("/logout", logoutPassenger);

export default router;
