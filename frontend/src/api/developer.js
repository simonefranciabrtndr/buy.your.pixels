import inferApiBaseUrl from "./baseUrl";

const BASE_URL = inferApiBaseUrl();
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const authFetch = async (path, token, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const developerLogin = async (password) => {
  const response = await fetch(`${BASE_URL}/developer/login`, {
    method: "POST",
    credentials: "include",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Developer login failed");
  }
  return response.json();
};

export const fetchDeveloperPurchases = (token) =>
  authFetch("/developer/purchases", token);

export const updateDeveloperPurchase = (token, purchaseId, payload) =>
  authFetch(`/developer/purchases/${encodeURIComponent(purchaseId)}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
