import inferApiBaseUrl from "./baseUrl";

const BASE_URL = inferApiBaseUrl();
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

export const registerProfile = async ({ email, username, password, avatarData, subscribeNewsletter }) => {
  const response = await fetch(`${BASE_URL}/api/profile/register`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      email,
      username,
      password,
      avatarData,
      subscribeNewsletter: Boolean(subscribeNewsletter),
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to register profile");
  }
  return response.json();
};

export const loginProfile = async ({ email, password }) => {
  const response = await fetch(`${BASE_URL}/api/profile/login`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to login");
  }
  return response.json();
};

export const fetchProfile = async (token) => {
  const response = await fetch(`${BASE_URL}/api/profile/me`, {
    method: "GET",
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to load profile");
  }
  return response.json();
};

export const updateProfilePurchase = async (token, purchaseId, payload) => {
  const response = await fetch(`${BASE_URL}/api/profile/purchases/${encodeURIComponent(purchaseId)}`, {
    method: "PUT",
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to update purchase");
  }
  return response.json();
};
