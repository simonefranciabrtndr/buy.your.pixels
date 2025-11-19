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
    await fetch(`${BASE_URL}/api/purchases`, {
      method: "GET",
      headers: DEFAULT_HEADERS,
    })
  );
  return data?.purchases || [];
};

export const createPurchase = async (payload) => {
  const data = await handleResponse(
    await fetch(`${BASE_URL}/api/purchases`, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: JSON.stringify(payload),
    })
  );
  return data;
};
