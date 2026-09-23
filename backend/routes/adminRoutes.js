import { Router } from "express";
import { getAdminSession, getAdminOverview, listDriversForReview, loginAdmin, logoutAdmin, reviewDriverVerification } from "../controllers/adminController.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

const router = Router();
router.post("/login", loginAdmin);
router.get("/me", verifyAdmin, getAdminSession);
router.post("/logout", verifyAdmin, logoutAdmin);
router.get("/overview", verifyAdmin, getAdminOverview);
router.get("/drivers/pending", verifyAdmin, listDriversForReview);
router.patch("/drivers/:id/verification", verifyAdmin, reviewDriverVerification);

export default router;
