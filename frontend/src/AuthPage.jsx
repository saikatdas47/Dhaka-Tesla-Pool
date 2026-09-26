import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Brand from "./Brand.jsx";
import { api, emailOtp } from "./api.js";
export default function AuthPage({ mode, onAuthenticated }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState(() =>
    location.state?.role === "driver" ? "driver" : "passenger",
  );
  const isDriver = role === "driver";
  const formPanelRef = useRef(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [identity, setIdentity] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] =
    useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [passengerSeats, setPassengerSeats] = useState("4");
  const [serviceArea, setServiceArea] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [registrationToken, setRegistrationToken] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [demoAccounts, setDemoAccounts] = useState(null);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if (formPanelRef.current) formPanelRef.current.scrollTop = 0;
  }, [mode, role]);

  useEffect(() => {
    if (isRegister) return;
    let active = true;
    fetch("/api/demo-accounts", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (active) setDemoAccounts(result?.data || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isRegister]);

  function chooseDemo(demoRole, account) {
    setRole(demoRole);
    setIdentity(account.username);
    setPassword(account.password);
    setError("");
  }

  function chooseRole(nextRole) {
    if (nextRole === role) return;
    setRole(nextRole);
    setOtp("");
    setOtpSent(false);
    setRegistrationToken("");
    setVerificationMessage("");
    setError("");
    if (!isRegister) {
      setIdentity("");
      setPassword("");
    }
  }

  async function sendCode() {
    setError("");
    setVerificationMessage("");
    setSubmitting(true);
    try {
      await emailOtp("/send", { role, email: identity });
      setOtpSent(true);
      setRegistrationToken("");
      setVerificationMessage(
        "A six-digit code was sent to your email. It expires in 5 minutes.",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode() {
    setError("");
    setSubmitting(true);
    try {
      const result = await emailOtp("/verify", { role, email: identity, otp });
      setRegistrationToken(result.registrationToken);
      setVerificationMessage(
        "Email verified. Finish your registration within 10 minutes.",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (isRegister && !registrationToken) {
      setError("Verify your email before creating the account.");
      return;
    }
    setSubmitting(true);
    try {
      let body = { identity, password };
      if (isRegister) {
        body = {
          name,
          username,
          email: identity,
          phone,
          password,
          registrationToken,
        };
        if (isDriver) {
          body.licenseNumber = licenseNumber;
          body.licenseExpiry = licenseExpiry;
          body.vehicleModel = vehicleModel;
          body.vehicleRegistrationNumber = vehicleRegistrationNumber;
          body.vehicleColor = vehicleColor;
          body.passengerSeats = Number(passengerSeats);
          body.serviceArea = serviceArea;
        }
      }
      const result = await api(role, isRegister ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onAuthenticated(role, result[role], result.accessToken);
      navigate(`/${role}`, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`auth-layout ${isRegister ? "register-layout" : ""}`}>
      <section className="story-panel">
        <Brand light />
        <div className="story-copy">
          <span className="eyebrow light-eyebrow">
            A better way across the city
          </span>
          <h1>
            Dhaka moves better <em>together.</em>
          </h1>
          <p>
            Share a seat. Split the fare. Make your everyday journey a little
            lighter.
          </p>
          <div
            className="route-card"
            aria-label="Example route from Banani to Mohakhali"
          >
            <div className="route-stop">
              <span className="stop-dot start" />
              <span>
                <small>PICKUP</small>Banani, Dhaka
              </span>
            </div>
            <div className="route-line" />
            <div className="route-stop">
              <span className="stop-dot end" />
              <span>
                <small>DESTINATION</small>Mohakhali, Dhaka
              </span>
            </div>
            <span className="route-note">A city worth sharing.</span>
          </div>
        </div>
        <p className="story-footer">Made for the roads we know by heart.</p>
      </section>

      <main className="form-panel" ref={formPanelRef}>
        <div className="mobile-brand">
          <Brand />
        </div>
        <div
          className={`auth-box ${isDriver && isRegister ? "driver-form" : ""}`}
        >
          <span className="eyebrow">
            {isRegister ? "GET STARTED" : "WELCOME BACK"}
          </span>
          <h2>
            {isRegister
              ? `Create your ${role} account`
              : `Sign in as a ${role}`}
          </h2>
          <p className="form-intro">
            {isRegister
              ? "Choose your role and enter your details."
              : "Choose the account type you want to use."}
          </p>

          <div className="role-switch" role="group" aria-label="Account type">
            <button
              type="button"
              className={!isDriver ? "selected" : ""}
              aria-pressed={!isDriver}
              onClick={() => chooseRole("passenger")}
            >
              Passenger
            </button>
            <button
              type="button"
              className={isDriver ? "selected" : ""}
              aria-pressed={isDriver}
              onClick={() => chooseRole("driver")}
            >
              Driver
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <label className="field">
                  Full name
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Saikat Das"
                    autoComplete="name"
                    minLength="2"
                    maxLength="80"
                    required
                  />
                </label>
                <label className="field">
                  Username
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="e.g. saikatdas"
                    minLength="3"
                    maxLength="30"
                    pattern="[A-Za-z0-9_]+"
                    autoComplete="username"
                    required
                  />
                </label>
                {!isDriver && (
                  <label className="field">
                    Mobile number
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="01XXXXXXXXX"
                      required
                    />
                  </label>
                )}
              </>
            )}
            <label className="field">
              {isRegister ? "Email address" : "Email or username"}
              <input
                type={isRegister ? "email" : "text"}
                value={identity}
                onChange={(event) => {
                  setIdentity(event.target.value);
                  setOtpSent(false);
                  setRegistrationToken("");
                  setVerificationMessage("");
                }}
                placeholder={
                  isRegister ? "you@example.com" : "Email or username"
                }
                autoComplete={isRegister ? "email" : "username"}
                required
              />
            </label>
            {isRegister && (
              <div className="otp-panel">
                <button
                  type="button"
                  className="retry-button"
                  onClick={sendCode}
                  disabled={
                    submitting || !identity || Boolean(registrationToken)
                  }
                >
                  {otpSent ? "Resend code" : "Send verification code"}
                </button>
                {otpSent && !registrationToken && (
                  <div className="otp-entry">
                    <label className="field">
                      Six-digit email code
                      <input
                        inputMode="numeric"
                        value={otp}
                        onChange={(event) => setOtp(event.target.value)}
                        maxLength="6"
                        pattern="[0-9]{6}"
                        placeholder="123456"
                      />
                    </label>
                    <button
                      type="button"
                      className="retry-button"
                      onClick={verifyCode}
                      disabled={submitting || otp.length !== 6}
                    >
                      Verify code
                    </button>
                  </div>
                )}
                {verificationMessage && (
                  <p className="verification-message" role="status">
                    {verificationMessage}
                  </p>
                )}
              </div>
            )}
            {isRegister && isDriver && (
              <div className="driver-fields">
                <p className="form-section-title">Driver and vehicle details</p>
                <label className="field">
                  Mobile number
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="01XXXXXXXXX"
                    required
                  />
                </label>
                <label className="field">
                  Driving licence number
                  <input
                    value={licenseNumber}
                    onChange={(event) => setLicenseNumber(event.target.value)}
                    maxLength="40"
                    required
                  />
                </label>
                <label className="field">
                  Licence expiry date
                  <input
                    type="date"
                    value={licenseExpiry}
                    onChange={(event) => setLicenseExpiry(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  Tesla model
                  <select
                    value={vehicleModel}
                    onChange={(event) => setVehicleModel(event.target.value)}
                    required
                  >
                    <option value="">Choose model</option>
                    <option>Model 3</option>
                    <option>Model Y</option>
                    <option>Model S</option>
                    <option>Model X</option>
                  </select>
                </label>
                <label className="field">
                  Vehicle registration number
                  <input
                    value={vehicleRegistrationNumber}
                    onChange={(event) =>
                      setVehicleRegistrationNumber(event.target.value)
                    }
                    maxLength="40"
                    required
                  />
                </label>
                <label className="field">
                  Vehicle color
                  <input
                    value={vehicleColor}
                    onChange={(event) => setVehicleColor(event.target.value)}
                    maxLength="30"
                    required
                  />
                </label>
                <label className="field">
                  Passenger seats
                  <select
                    value={passengerSeats}
                    onChange={(event) => setPassengerSeats(event.target.value)}
                    required
                  >
                    {[2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Usual service area
                  <input
                    value={serviceArea}
                    onChange={(event) => setServiceArea(event.target.value)}
                    placeholder="e.g. Banani, Dhaka"
                    maxLength="80"
                    required
                  />
                </label>
                <p className="driver-note">
                  Your location is not tracked during signup. Licence and
                  vehicle details will show as pending verification.
                </p>
              </div>
            )}
            <label className="field">
              Password
              <span className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    isRegister ? "At least 8 characters" : "Enter your password"
                  }
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  minLength={isRegister ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {isRegister && (
              <label className="field">
                Confirm password
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter password again"
                  autoComplete="new-password"
                  required
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary-button"
              type="submit"
              disabled={submitting || (isRegister && !registrationToken)}
            >
              {submitting
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          {!isRegister && demoAccounts && (
            <div className="demo-logins">
              <span className="card-kicker">QUICK DEMO LOGIN</span>
              <p>Click an account to fill in its login details.</p>
              <div>
                {demoAccounts.passengers.map((account) => (
                  <button
                    type="button"
                    key={account.username}
                    onClick={() => chooseDemo("passenger", account)}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
              <div>
                {demoAccounts.drivers.map((account) => (
                  <button
                    type="button"
                    key={account.username}
                    onClick={() => chooseDemo("driver", account)}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="switch-auth">
            {isRegister
              ? "Already have an account?"
              : "New to Dhaka Tesla Pool?"}{" "}
            <Link to={isRegister ? "/login" : "/register"} state={{ role }}>
              {isRegister ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {!isRegister && (
            <p className="switch-auth">
              <Link to="/admin">Admin sign in</Link>
            </p>
          )}
        </div>
        <p className="form-footer">
          © {new Date().getFullYear()} Dhaka Tesla Pool
        </p>
      </main>
    </div>
  );
}
