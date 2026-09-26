import { roleFetch } from "./tabAuth.js";
export async function api(role, path, options = {}) {
  const collection = role === "driver" ? "drivers" : "passengers";
  const isForm = options.body instanceof FormData;
  const publicAuth = ["/login", "/register"].includes(path);
  const perform = publicAuth
    ? fetch
    : (url, opts) => roleFetch(role, url, opts);
  const response = await perform(`/api/${collection}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.message || "Something went wrong. Please try again.");
  return data.data;
}

export async function emailOtp(path, body) {
  const response = await fetch(`/api/email-otp${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.message || "Email verification failed.");
  return data.data;
}

export async function adminApi(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Admin request failed.");
  return data.data;
}
