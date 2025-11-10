const cache = new Map();

export const loadPayPalSdk = (clientId, currency) => {
  if (typeof window === "undefined") return Promise.reject(new Error("PayPal SDK unavailable"));
  if (!clientId) return Promise.reject(new Error("Missing PayPal clientId"));
  const key = `${clientId}:${currency || ""}`;
  if (cache.has(key)) return cache.get(key);

  const url = new URL("https://www.paypal.com/sdk/js");
  url.searchParams.set("client-id", clientId);
  if (currency) url.searchParams.set("currency", currency.toUpperCase());

  const promise = new Promise((resolve, reject) => {
    if (window.paypal && window.paypal.Buttons) {
      resolve(window.paypal);
      return;
    }

    const existing = document.querySelector(`script[src="${url.href}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.paypal));
      existing.addEventListener("error", () => reject(new Error("Unable to load PayPal SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = url.href;
    script.async = true;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error("Unable to load PayPal SDK"));
    document.head.appendChild(script);
  });

  cache.set(key, promise);
  return promise;
};
