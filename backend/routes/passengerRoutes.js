import { Router } from "express";
import {
  registerPassenger,
  loginPassenger,
  refreshPassengerToken,
  getCurrentPassenger,
  updatePassengerProfile,
  logoutPassenger,
  uploadPassengerAvatar,
  retryPassengerAvatar,
  removePassengerAvatar,
} from "../controllers/passengerController.js";
import { verifyPassenger, requireNoPendingAvatar } from "../middlewares/auth.middleware.js";
import { uploadAvatarFile } from "../middlewares/multer.middleware.js";

const router = Router();

router.route("/register").post(registerPassenger);
router.route("/login").post(loginPassenger);
router.route("/refresh-token").post(refreshPassengerToken);
router.route("/me").get(verifyPassenger, getCurrentPassenger).patch(verifyPassenger, updatePassengerProfile);
router.route("/logout").post(logoutPassenger);
router.route("/avatar").post(verifyPassenger, requireNoPendingAvatar, uploadAvatarFile, uploadPassengerAvatar).delete(verifyPassenger, removePassengerAvatar);
router.route("/avatar/retry").post(verifyPassenger, retryPassengerAvatar);

export default router;
