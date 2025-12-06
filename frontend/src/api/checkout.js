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

  // --- SAFE NORMALIZATION ---
  const safeRect =
    area?.rect && typeof area.rect === "object"
      ? JSON.stringify(area.rect)
      : null;

  const safeTiles =
    area?.tiles && Array.isArray(area.tiles)
      ? JSON.stringify(area.tiles)
      : null;

  const safeArea =
    typeof area?.area === "number"
      ? area.area
      : area?.rect?.w && area?.rect?.h
      ? area.rect.w * area.rect.h
      : 0;

  const payload = {
    area: area || null,
    price: amount,
    currency,
    metadata: {
      rect: safeRect,
      tiles: safeTiles,
      area: safeArea,
      price: amount,
      ...metadata,
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
