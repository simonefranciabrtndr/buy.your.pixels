import inferApiBaseUrl from "./baseUrl";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const BASE_URL = inferApiBaseUrl();

const jsonFetch = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const createCheckoutSession = async ({ area, price, currency = "eur", metadata = {} }) => {
  const amount = Number(price || 0);
  const payload = {
    area,
    price: amount,
    currency,
    metadata: {
      ...metadata,
      rect: area?.rect ? JSON.stringify(area.rect) : undefined,
      tiles: area?.tiles ? JSON.stringify(area.tiles) : undefined,
      area: area?.area ?? area?.rect?.w * area?.rect?.h ?? 0,
      price: amount,
    },
  };
  return jsonFetch("/checkout/session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const acknowledgePayment = async (sessionId, provider, payload = {}) =>
  jsonFetch(`/checkout/session/${encodeURIComponent(sessionId)}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ provider, payload }),
  });
