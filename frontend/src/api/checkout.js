const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const inferApiBaseUrl = () => {
  const envBase = import.meta?.env?.VITE_API_BASE_URL;
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    return isLocalhost ? "http://localhost:4000" : origin;
  }

  return "http://localhost:4000";
};

const BASE_URL = inferApiBaseUrl();

const jsonFetch = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
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
  return jsonFetch("/api/checkout/session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const capturePayPalOrder = async (orderId) =>
  jsonFetch(`/api/paypal/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
  });

export const acknowledgePayment = async (sessionId, provider, payload = {}) =>
  jsonFetch(`/api/checkout/session/${encodeURIComponent(sessionId)}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ provider, payload }),
  });
