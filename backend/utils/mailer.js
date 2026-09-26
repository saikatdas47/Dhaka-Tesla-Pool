import nodemailer from "nodemailer";

let transporter;

export async function sendOtpEmail({ email, otp }) {
  const user = process.env.EMAIL_USER;
  const password = process.env.EMAIL_APP_PASSWORD;
  if (!user || !password) throw new Error("Email sender is not configured.");

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: password },
    });
  }
  const fromName = (process.env.EMAIL_FROM_NAME || "Dhaka Tesla Pool").replace(
    /[\r\n"]/g,
    "",
  );
  await transporter.sendMail({
    from: `"${fromName}" <${user}>`,
    to: email,
    subject: "Dhaka Tesla Pool email verification code",
    text: `Your verification code is ${otp}. It expires in 5 minutes. If you did not request it, ignore this email.`,
  });
}
