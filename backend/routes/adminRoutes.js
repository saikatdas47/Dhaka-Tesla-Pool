import { Router } from "express";
import { getAdminSession, getAdminOverview, getDriverForAdmin, getLocalAdminAutofill, listDrivers, listDriversForReview, loginAdmin, logoutAdmin, reviewDriverVerification } from "../controllers/adminController.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

const router = Router();
router.post("/login", loginAdmin);
router.get("/local-autofill", getLocalAdminAutofill);
router.get("/me", verifyAdmin, getAdminSession);
router.post("/logout", verifyAdmin, logoutAdmin);
router.get("/overview", verifyAdmin, getAdminOverview);
router.get("/drivers", verifyAdmin, listDrivers);
router.get("/drivers/pending", verifyAdmin, listDriversForReview);
router.get("/drivers/:id", verifyAdmin, getDriverForAdmin);
router.patch("/drivers/:id/verification", verifyAdmin, reviewDriverVerification);

export default router;
