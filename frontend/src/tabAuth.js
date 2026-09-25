const roleKey = "teslaPoolBrowserRole";
const pendingRefreshes = new Map();

export function getTabRole() {
  return localStorage.getItem(roleKey);
}

export function setTabAuth(role) {
  localStorage.setItem(roleKey, role);
  sessionStorage.removeItem("teslaPoolTabRole");
  sessionStorage.removeItem("teslaPoolTabAccessToken");
}

export function clearTabAuth() {
  localStorage.removeItem(roleKey);
  sessionStorage.removeItem("teslaPoolTabRole");
  sessionStorage.removeItem("teslaPoolTabAccessToken");
}

export async function roleFetch(role, url, options = {}) {
  const request = () => fetch(url, { ...options, credentials: "same-origin" });
  let response = await request();
  if (response.status === 401) {
    const collection = role === "driver" ? "drivers" : "passengers";
    if (!pendingRefreshes.has(role)) {
      const refresh = fetch(`/api/${collection}/refresh-token`, { method: "POST", credentials: "same-origin" })
        .finally(() => pendingRefreshes.delete(role));
      pendingRefreshes.set(role, refresh);
    }
    const refreshed = await pendingRefreshes.get(role);
    if (refreshed.ok) response = await request();
  }
  if (response.status === 401 && getTabRole() === role) {
    clearTabAuth();
    window.dispatchEvent(new Event("tab-auth-expired"));
  }
  return response;
}
