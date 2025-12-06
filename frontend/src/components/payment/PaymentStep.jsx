import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createCheckoutSession, acknowledgePayment } from "../../api/checkout";
import { loadStripeJs } from "./stripeLoader";
import { useCurrency } from "../../context/CurrencyContext";
import inferApiBaseUrl from "../../api/baseUrl";

const PAYMENT_CURRENCY = "EUR";

export default function PaymentStep({ area, price, onBack, onCancel, onSuccess }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [selectedStripeMethod, setSelectedStripeMethod] = useState("card");
  const navigate = useNavigate();
  const { selectedCurrency, rates, convertCurrency, formatCurrency } = useCurrency();
  const activeCurrency = selectedCurrency || "EUR";
  const totalPriceEUR = Number(price || 0);
  const convertedTotal = convertCurrency(totalPriceEUR, activeCurrency, rates);
  const displayTotal = formatCurrency(convertedTotal, activeCurrency);
  const displayChargeCurrency = formatCurrency(totalPriceEUR, "EUR");

  const [stripeApi, setStripeApi] = useState({ stripe: null, elements: null, paymentElement: null });
  const [stripeProcessing, setStripeProcessing] = useState(false);
  const paymentElementRef = useRef(null);
  const [paypalConfig, setPaypalConfig] = useState(null);
  const [paypalScriptLoaded, setPaypalScriptLoaded] = useState(false);
  const [paypalError, setPaypalError] = useState(null);
  const [isPayPalProcessing, setIsPayPalProcessing] = useState(false);
  const paypalButtonsRef = useRef(null);
  const apiBaseUrl = useMemo(() => inferApiBaseUrl(), []);

  const areaSummary = useMemo(() => {
    const pixels = Math.round(area?.area || 0);
    return {
      pixelsFormatted: pixels.toLocaleString(),
      pixelsRaw: pixels,
    };
  }, [area]);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "begin_checkout", {
        value: totalPriceEUR,
        currency: "EUR",
      });
    }
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "InitiateCheckout");
    }
  }, [totalPriceEUR]);

  const reloadSession = useCallback(async () => {
    if (!price || !area) return;
    setStatus("loading");
    setError(null);
    setPaypalError(null);
    setIsPayPalProcessing(false);
    setStripeApi({ stripe: null, elements: null, paymentElement: null });
    try {
      const response = await createCheckoutSession({
        area,
        price: Number(price),
        currency: PAYMENT_CURRENCY.toLowerCase(),
      });
      setSession(response);
      setStatus("ready");
    } catch (err) {
      console.error("Checkout session error", err);
      setError(err.message || "Unable to start the payment flow.");
      setStatus("error");
    }
  }, [area, price]);

  useEffect(() => {
    reloadSession();
  }, [reloadSession]);

  const stripeInfo = session?.stripe;

  useEffect(() => {
    let cancelled = false;
    if (!stripeInfo?.publishableKey || !stripeInfo?.clientSecret) return undefined;

    loadStripeJs()
      .then((StripeConstructor) => {
        if (cancelled) return;
        const stripe = StripeConstructor(stripeInfo.publishableKey);
        let elements;
        try {
          elements = stripe.elements({
            clientSecret: stripeInfo.clientSecret,
            appearance: {
              theme: "night",
              variables: {
                colorPrimary: "#4f9dff",
                colorBackground: "rgba(10,12,22,0.85)",
                colorText: "#e7f2ff",
                colorDanger: "#ff9090",
                borderRadius: "14px",
              },
              rules: {
                ".Input": {
                  color: "#e7f2ff",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "transparent",
                },
                ".Label": {
                  color: "rgba(231,242,255,0.8)",
                  fontWeight: 500,
                },
              },
            },
          });
        } catch (err) {
          console.error("Stripe Elements error", err);
          setError(err.message || "Stripe is not available at the moment.");
          return;
        }
        if (cancelled) return;
        setStripeApi({ stripe, elements, paymentElement: null });
      })
      .catch((err) => {
        console.error("Stripe SDK error", err);
        setError(err.message || "Stripe is not available at the moment.");
      });

    return () => {
      cancelled = true;
    };
  }, [stripeInfo?.publishableKey, stripeInfo?.clientSecret]);

  useEffect(() => {
    if (!stripeApi.elements || !paymentElementRef.current) return undefined;
    const paymentElement = stripeApi.elements.create("payment", {
      layout: "tabs",
    });
    paymentElement.mount(paymentElementRef.current);
    setStripeApi((prev) => ({ ...prev, paymentElement }));

    return () => {
      paymentElement.destroy();
      setStripeApi((prev) => ({ ...prev, paymentElement: null }));
    };
  }, [stripeApi.elements]);

  const buildPayPalPayload = useCallback(() => {
    const normalizedPrice = Number(price || 0);
    return {
      sessionId: session?.sessionId,
      area,
      price: normalizedPrice,
      currency: PAYMENT_CURRENCY.toLowerCase(),
      description: "Buy Your Pixels purchase",
      metadata: {
        rect: area?.rect ? JSON.stringify(area.rect) : undefined,
        tiles: area?.tiles ? JSON.stringify(area.tiles) : undefined,
        area: area?.area ?? area?.rect?.w * area?.rect?.h ?? 0,
        price: normalizedPrice,
        sessionId: session?.sessionId,
      },
    };
  }, [area, price, session?.sessionId]);

  const handleStripePay = async () => {
    if (!stripeApi.stripe || !stripeApi.elements || !stripeInfo?.clientSecret) return;

    setStripeProcessing(true);
    setError(null);

    try {
      // CARD / APPLE PAY
      if (selectedStripeMethod === "card") {
        const { error: stripeError, paymentIntent } = await stripeApi.stripe.confirmPayment({
          elements: stripeApi.elements,
          redirect: "if_required",
        });

        if (stripeError) {
          console.error("[stripe][card] payment failed:", stripeError);
          alert("Your upload or link was rejected for security reasons. Please adjust and try again.");
          return;
        }

        console.info("[stripe][card] payment success:", paymentIntent?.id);
        await acknowledgePayment(session.sessionId, "stripe", { paymentIntentId: paymentIntent.id });
        onSuccess?.({ provider: "stripe", paymentIntent });
        return;
      }

      // REVOLUT PAY REDIRECT FLOW
      if (selectedStripeMethod === "revolut") {
        console.info("[revolut] Starting redirect flow");

        const { error } = await stripeApi.stripe.confirmPayment({
          clientSecret: stripeInfo.clientSecret,
          confirmParams: {
            return_url: `https://yourpixels.online/success?session=${session.sessionId}`,
          },
        });

        if (error) {
          console.error("[revolut] Payment failed:", error);
          alert("Revolut Pay could not complete your payment. Please try again.");
        }

        return; // Stripe handles redirect
      }
    } catch (err) {
      console.error("[checkout] unexpected error:", err);
      setError(err.message || "Unexpected payment error");
    } finally {
      setStripeProcessing(false);
    }
  };

  const showStripe = Boolean(stripeInfo?.clientSecret && stripeInfo?.publishableKey);
  const stripeReady = Boolean(showStripe && stripeApi.paymentElement);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/paypal/config`, {
          method: "GET",
          credentials: "include",
        });
        const json = await response.json();
        if (cancelled) return;
        setPaypalConfig(json);
        if (!json?.enabled && json?.reason) {
          setPaypalError(json.reason);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("PayPal config error", err);
        setPaypalConfig({ enabled: false, reason: "PayPal is unavailable right now." });
        setPaypalError("PayPal is unavailable right now.");
      }
    };
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!paypalConfig?.enabled || !paypalConfig?.clientId) return;

    const existing = document.querySelector("script[data-paypal-sdk]");
    if (existing && window.paypal) {
      setPaypalScriptLoaded(true);
      return;
    }

    if (existing && !window.paypal) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      paypalConfig.clientId
    )}&currency=${paypalConfig.currency || "EUR"}&intent=capture`;
    script.async = true;
    script.dataset.paypalSdk = "true";

    script.onload = () => setPaypalScriptLoaded(true);
    script.onerror = () => setPaypalError("Unable to load PayPal SDK.");
    document.body.appendChild(script);
  }, [paypalConfig]);

  const handlePayPalSuccess = useCallback(
    (orderReference) => {
      onSuccess?.({ provider: "paypal", orderId: orderReference });
      setTimeout(() => {
        const query = new URLSearchParams({
          order: session?.sessionId || orderReference,
          value: totalPriceEUR.toString(),
          pixels: String(areaSummary.pixelsRaw || 0),
        }).toString();
        navigate(`/success?${query}`, {
          state: {
            orderId: session?.sessionId || orderReference,
            value: totalPriceEUR,
            pixels: areaSummary.pixelsRaw || 0,
          },
        });
      }, 600);
    },
    [areaSummary.pixelsRaw, navigate, onSuccess, session?.sessionId, totalPriceEUR]
  );

  useEffect(() => {
    if (!paypalConfig?.enabled) return;
    if (!paypalScriptLoaded) return;
    if (!window.paypal) return;

    const container = paypalButtonsRef.current;
    if (!container) return;

    container.innerHTML = "";

    const buttons = window.paypal.Buttons({
      style: { layout: "vertical" },
      createOrder: async () => {
        const payload = buildPayPalPayload();
        const res = await fetch(`${apiBaseUrl}/paypal/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json?.success) throw new Error("createOrder failed");
        return json.orderId;
      },
      onApprove: async (data) => {
        const res = await fetch(`${apiBaseUrl}/paypal/capture-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            orderId: data?.orderID,
            purchaseId: session?.sessionId,
          }),
        });
        const json = await res.json();
        if (!json?.success) throw new Error("captureOrder failed");
        acknowledgePayment(session?.sessionId, "paypal", { orderId: data?.orderID });
        handlePayPalSuccess(data?.orderID);
      },
      onError: () => {
        setPaypalError("PayPal error. Please try again.");
      },
    });

    buttons.render(container);

    return () => {
      try {
        buttons.close();
      } catch (err) {
        console.warn("PayPal Buttons cleanup issue", err);
      }
    };
  }, [apiBaseUrl, buildPayPalPayload, handlePayPalSuccess, paypalConfig, paypalScriptLoaded, session?.sessionId]);

  return (
    <div className="payment-step">
      <h3>Complete your payment</h3>
      <p className="payment-step-sub">Choose any available method to finalize your purchase.</p>

      {status === "loading" && <div className="payment-loader">Preparing checkout…</div>}
      {status === "error" && (
        <div className="payment-error" role="alert">
          {error || "Something went wrong."}
          <div className="payment-retry-buttons">
            <button type="button" className="popup-skip" onClick={reloadSession}>
              Try again
            </button>
            <button type="button" className="popup-skip" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      )}

      {status === "ready" && (
        <>
          <div className="payment-summary">
            <div>
              <span className="payment-summary-label">Pixel</span>
              <span>{areaSummary.pixelsFormatted}</span>
            </div>
            <div>
              <span className="payment-summary-label">Total</span>
              <span>
                {displayTotal}
                <small style={{ display: "block", fontSize: "11px", opacity: 0.7 }}>
                  You will be charged {displayChargeCurrency}
                </small>
              </span>
            </div>
          </div>

          {showStripe && (
            <div className="payment-provider-card">
              <h4>Card / Apple Pay</h4>
              <div
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  background: "rgba(10,12,22,0.85)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  marginBottom: "12px",
                }}
              >
                <div ref={paymentElementRef} style={{ minHeight: "80px" }} />
                {!stripeReady && <div className="payment-loader">Preparing card methods…</div>}
              </div>
              <button
                type="button"
                className="popup-continue"
                disabled={stripeProcessing || !stripeReady}
                onClick={handleStripePay}
              >
                {stripeProcessing ? "Processing…" : "Pay with card"}
              </button>
            </div>
          )}

          <div className="divider">
            <span>or</span>
          </div>

          <section className="paypal-section">
            <h3>Pay with PayPal</h3>
            {!paypalConfig && <div className="payment-loader">Preparing PayPal…</div>}
            {paypalConfig && !paypalConfig.enabled && (
              <div className="payment-error" role="alert">
                {paypalConfig.reason || "PayPal is currently unavailable."}
              </div>
            )}
            {paypalConfig?.enabled && (
              <>
                <div ref={paypalButtonsRef} id="paypal-button-container" />
                {isPayPalProcessing && <div className="payment-loader">Processing with PayPal…</div>}
              </>
            )}
            {paypalError && (
              <div className="payment-error" role="alert">
                {paypalError}
              </div>
            )}
          </section>

          {!showStripe && <div className="payment-error">No payment methods are available right now.</div>}

          {error && status === "ready" && (
            <div className="payment-error" role="alert">
              {error}
            </div>
          )}
        </>
      )}

      <div className="payment-footer">
        <button type="button" className="popup-skip" onClick={onBack}>
          Back
        </button>
        <button type="button" className="popup-skip" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
