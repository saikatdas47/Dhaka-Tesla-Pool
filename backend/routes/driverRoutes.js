import { Router } from "express";
import { registerDriver, loginDriver, refreshDriverToken, getCurrentDriver, logoutDriver } from "../controllers/driverController.js";
import { verifyDriver } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(registerDriver);
router.route("/login").post(loginDriver);
router.route("/refresh-token").post(refreshDriverToken);
router.route("/me").get(verifyDriver, getCurrentDriver);
router.route("/logout").post(logoutDriver);

export default router;
