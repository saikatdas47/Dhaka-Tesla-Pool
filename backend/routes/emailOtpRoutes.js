import { Router } from "express";
import { sendEmailOtp, verifyEmailOtp } from "../controllers/emailOtpController.js";

const router = Router();
router.route("/send").post(sendEmailOtp);
router.route("/verify").post(verifyEmailOtp);
export default router;
