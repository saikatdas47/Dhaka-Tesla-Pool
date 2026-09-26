import { Router } from "express";
import {
  verifyDriver,
  verifyPassenger,
} from "../middlewares/auth.middleware.js";
import {
  acceptRide,
  advancePool,
  cancelRide,
  confirmCashPayment,
  createRide,
  driverHistory,
  driverOffers,
  driverPool,
  getRideConfig,
  myRides,
  nearbyDrivers,
  quoteRide,
} from "../controllers/rideController.js";
import {
  submitDriverReview,
  myDriverReviews,
} from "../controllers/driverReviewController.js";

const router = Router();
router.get("/config", getRideConfig);
router.post("/quote", verifyPassenger, quoteRide);
router.post("/requests", verifyPassenger, createRide);
router.get("/mine", verifyPassenger, myRides);
router.get("/reviews/mine", verifyPassenger, myDriverReviews);
router.post("/requests/:id/review", verifyPassenger, submitDriverReview);
router.patch("/requests/:id/cancel", verifyPassenger, cancelRide);
router.get("/nearby-drivers", verifyPassenger, nearbyDrivers);
router.get("/offers", verifyDriver, driverOffers);
router.get("/driver/current", verifyDriver, driverPool);
router.get("/driver/history", verifyDriver, driverHistory);
router.post("/requests/:id/accept", verifyDriver, acceptRide);
router.post("/requests/:id/confirm-cash", verifyDriver, confirmCashPayment);
router.patch("/pools/:id/status", verifyDriver, advancePool);
export default router;
