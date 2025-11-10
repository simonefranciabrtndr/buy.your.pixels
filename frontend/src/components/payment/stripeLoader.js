const STRIPE_SRC = "https://js.stripe.com/v3/";

let stripeJsPromise = null;

export const loadStripeJs = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Stripe SDK unavailable"));
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (stripeJsPromise) return stripeJsPromise;

  stripeJsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${STRIPE_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.Stripe));
      existingScript.addEventListener("error", () => reject(new Error("Unable to load Stripe SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = STRIPE_SRC;
    script.async = true;
    script.onload = () => resolve(window.Stripe);
    script.onerror = () => reject(new Error("Unable to load Stripe SDK"));
    document.head.appendChild(script);
  });

  return stripeJsPromise;
};
