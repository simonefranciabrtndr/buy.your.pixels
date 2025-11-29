import inferApiBaseUrl from "./baseUrl";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const BASE_URL = inferApiBaseUrl();

const handleResponse = async (response) => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const fetchPurchases = async () => {
  const data = await handleResponse(
    await fetch(`${BASE_URL}/purchases`, {
      method: "GET",
      credentials: "include",
      headers: DEFAULT_HEADERS,
    })
  );
  return data?.purchases || [];
};

export const createPurchase = async (payload, token) => {
  const data = await handleResponse(
    await fetch(`${BASE_URL}/purchases`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...DEFAULT_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })
  );
  return data;
};
