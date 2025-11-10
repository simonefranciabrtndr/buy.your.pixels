const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const BASE_URL = import.meta?.env?.VITE_API_BASE_URL || "http://localhost:4000";

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
  const payload = {
    area,
    price,
    currency,
    metadata,
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
