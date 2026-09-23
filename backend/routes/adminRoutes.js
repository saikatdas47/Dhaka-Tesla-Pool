import { Router } from "express";
import { getAdminSession, getAdminOverview, getAdminFareSettings, updateAdminFareSettings, getDriverForAdmin, getPassengerForAdmin, getLocalAdminAutofill, listDrivers, listDriversForReview, listPassengers, loginAdmin, logoutAdmin, reviewDriverVerification } from "../controllers/adminController.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

const router = Router();
router.post("/login", loginAdmin);
router.get("/local-autofill", getLocalAdminAutofill);
router.get("/me", verifyAdmin, getAdminSession);
router.post("/logout", verifyAdmin, logoutAdmin);
router.get("/overview", verifyAdmin, getAdminOverview);
router.get("/fare-settings", verifyAdmin, getAdminFareSettings);
router.put("/fare-settings", verifyAdmin, updateAdminFareSettings);
router.get("/passengers", verifyAdmin, listPassengers);
router.get("/passengers/:id", verifyAdmin, getPassengerForAdmin);
router.get("/drivers", verifyAdmin, listDrivers);
router.get("/drivers/pending", verifyAdmin, listDriversForReview);
router.get("/drivers/:id", verifyAdmin, getDriverForAdmin);
router.patch("/drivers/:id/verification", verifyAdmin, reviewDriverVerification);

export default router;
