import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import RolePage from "./RolePages.jsx";
import Brand from "./Brand.jsx";
import AuthPage from "./AuthPage.jsx";
import AdminPage from "./AdminPage.jsx";
import { api } from "./api.js";
import { clearTabAuth, getTabRole, setTabAuth } from "./tabAuth.js";
export default function App() {
  const [accounts, setAccounts] = useState({ passenger: null, driver: null });
  const [activeRole, setActiveRole] = useState(() =>
    localStorage.getItem("activeRole"),
  );
  const [checkingSession, setCheckingSession] = useState(true);

  function updateAccount(role, account) {
    setAccounts((current) => ({ ...current, [role]: account }));
  }

  function authenticated(role, account) {
    if (role === "admin") clearTabAuth();
    else setTabAuth(role);
    setAccounts({
      passenger: role === "passenger" ? account : null,
      driver: role === "driver" ? account : null,
    });
    setActiveRole(role);
    localStorage.setItem("activeRole", role);
    sessionStorage.removeItem("activeRole");
  }

  function loggedOut() {
    clearTabAuth();
    setAccounts({ passenger: null, driver: null });
    setActiveRole(null);
    localStorage.removeItem("activeRole");
    sessionStorage.removeItem("activeRole");
  }

  useEffect(() => {
    let active = true;
    if (localStorage.getItem("activeRole") === "admin") {
      setCheckingSession(false);
      return () => {
        active = false;
      };
    }
    Promise.all(
      ["passenger", "driver"].map(async (role) => {
        try {
          return [role, (await api(role, "/me"))[role]];
        } catch {
          return [role, null];
        }
      }),
    )
      .then((results) => {
        if (!active) return;
        const restored = Object.fromEntries(results);
        const preferred = getTabRole() || localStorage.getItem("activeRole");
        let role = null;
        if (restored[preferred]) role = preferred;
        else if (restored.driver) role = "driver";
        else if (restored.passenger) role = "passenger";
        setAccounts({
          passenger: role === "passenger" ? restored.passenger : null,
          driver: role === "driver" ? restored.driver : null,
        });
        setActiveRole(role);
        if (role) {
          setTabAuth(role);
          localStorage.setItem("activeRole", role);
        } else loggedOut();
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const expire = () => loggedOut();
    window.addEventListener("tab-auth-expired", expire);
    return () => window.removeEventListener("tab-auth-expired", expire);
  }, []);

  if (checkingSession)
    return (
      <div className="loading-screen">
        <Brand />
        <p>Getting things ready…</p>
      </div>
    );

  let homePath = "/login";
  if (activeRole === "admin") homePath = "/admin";
  else if (activeRole === "driver" && accounts.driver) homePath = "/driver";
  else if (activeRole === "passenger" && accounts.passenger)
    homePath = "/passenger";

  // Each role has the same three pages, but its own account and URL.
  const roleRoutes = [];
  for (const role of ["passenger", "driver"]) {
    const account = accounts[role];
    for (const page of ["dashboard", "profile", "history"]) {
      let path = `/${role}`;
      if (page !== "dashboard") path += `/${page}`;
      let element = <Navigate to="/login" state={{ role }} replace />;
      if (activeRole === role && account) {
        element = (
          <RolePage
            role={role}
            account={account}
            page={page}
            Brand={Brand}
            onLogout={loggedOut}
            onUpdated={(value) => updateAccount(role, value)}
          />
        );
      }
      roleRoutes.push(
        <Route key={`${role}-${page}`} path={path} element={element} />,
      );
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={homePath} replace />} />
      {roleRoutes}
      <Route
        path="/login"
        element={<AuthPage mode="login" onAuthenticated={authenticated} />}
      />
      <Route
        path="/register"
        element={
          activeRole ? (
            <Navigate to="/" replace />
          ) : (
            <AuthPage mode="register" onAuthenticated={authenticated} />
          )
        }
      />
      <Route
        path="/login/passenger"
        element={<Navigate to="/login" state={{ role: "passenger" }} replace />}
      />
      <Route
        path="/login/driver"
        element={<Navigate to="/login" state={{ role: "driver" }} replace />}
      />
      <Route
        path="/register/passenger"
        element={
          <Navigate to="/register" state={{ role: "passenger" }} replace />
        }
      />
      <Route
        path="/register/driver"
        element={<Navigate to="/register" state={{ role: "driver" }} replace />}
      />
      <Route
        path="/admin/*"
        element={
          activeRole && activeRole !== "admin" ? (
            <Navigate to="/" replace />
          ) : (
            <AdminPage
              onAuthenticated={() => authenticated("admin", null)}
              onLoggedOut={loggedOut}
            />
          )
        }
      />
      <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
