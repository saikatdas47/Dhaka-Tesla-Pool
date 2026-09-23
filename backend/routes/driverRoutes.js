import { Router } from "express";
import { registerDriver, loginDriver, refreshDriverToken, getCurrentDriver, updateDriverProfile, logoutDriver, uploadDriverAvatar, retryDriverAvatar } from "../controllers/driverController.js";
import { verifyDriver, requireNoPendingAvatar } from "../middlewares/auth.middleware.js";
import { uploadAvatarFile } from "../middlewares/multer.middleware.js";

const router = Router();

router.route("/register").post(registerDriver);
router.route("/login").post(loginDriver);
router.route("/refresh-token").post(refreshDriverToken);
router.route("/me").get(verifyDriver, getCurrentDriver).patch(verifyDriver, updateDriverProfile);
router.route("/logout").post(logoutDriver);
router.route("/avatar").post(verifyDriver, requireNoPendingAvatar, uploadAvatarFile, uploadDriverAvatar);
router.route("/avatar/retry").post(verifyDriver, retryDriverAvatar);

export default router;
