import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createCheckoutSession, capturePayPalOrder, acknowledgePayment } from "../../api/checkout";
import { loadStripeJs } from "./stripeLoader";
import { loadPayPalSdk } from "./paypalLoader";
import { useCurrencyFormatter } from "../../utils/formatters";

const PAYMENT_CURRENCY = "EUR";

export default function PaymentStep({ area, price, onBack, onCancel, onSuccess }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const { formatCurrency } = useCurrencyFormatter();
  const totalPriceEUR = Number(price || 0);

  const [stripeApi, setStripeApi] = useState({ stripe: null, elements: null, paymentElement: null });
  const [stripeProcessing, setStripeProcessing] = useState(false);
  const paymentElementRef = useRef(null);

  const paypalContainerRef = useRef(null);
  const paypalRenderedRef = useRef(false);

  const areaSummary = useMemo(() => {
    const pixels = Math.round(area?.area || 0);
    return {
      pixelsFormatted: pixels.toLocaleString(),
    };
  }, [area]);

  const reloadSession = useCallback(async () => {
    if (!price || !area) return;
    setStatus("loading");
    setError(null);
    setStripeApi({ stripe: null, elements: null, paymentElement: null });
    paypalRenderedRef.current = false;
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

  const handleStripePay = async () => {
    if (!stripeApi.stripe || !stripeApi.elements || !stripeInfo?.clientSecret) return;
    setStripeProcessing(true);
    setError(null);
    try {
      const { error: stripeError, paymentIntent } = await stripeApi.stripe.confirmPayment({
        elements: stripeApi.elements,
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message || "Stripe payment failed");
        return;
      }

      try {
        if (session?.sessionId) {
          await acknowledgePayment(session.sessionId, "stripe", { paymentIntentId: paymentIntent.id });
        }
      } catch (ackErr) {
        console.warn("Unable to acknowledge payment on the server", ackErr);
      }

      onSuccess?.({ provider: "stripe", paymentIntent });
    } catch (err) {
      setError(err.message || "Unexpected Stripe error");
    } finally {
      setStripeProcessing(false);
    }
  };

  const showStripe = Boolean(stripeInfo?.clientSecret && stripeInfo?.publishableKey);
  const stripeReady = Boolean(showStripe && stripeApi.paymentElement);

  const paypalInfo = session?.paypal;

  useEffect(() => {
    if (!paypalInfo?.clientId || !paypalContainerRef.current || paypalRenderedRef.current) return undefined;
    let active = true;

    loadPayPalSdk(paypalInfo.clientId, PAYMENT_CURRENCY)
      .then((paypal) => {
        if (!active || !paypal?.Buttons) return;
        paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect" },
          createOrder: () => paypalInfo.orderId,
          onApprove: async (data) => {
            try {
              const capture = await capturePayPalOrder(data.orderID || paypalInfo.orderId);
              if (session?.sessionId) {
                await acknowledgePayment(session.sessionId, "paypal", { orderId: data.orderID || paypalInfo.orderId });
              }
              onSuccess?.({ provider: "paypal", capture });
            } catch (err) {
              console.error("PayPal capture error", err);
              setError(err.message || "Unable to finalize the PayPal payment");
            }
          },
          onError: (err) => {
            console.error("PayPal error", err);
            setError(err.message || "PayPal is not available right now.");
          },
        }).render(paypalContainerRef.current);
        paypalRenderedRef.current = true;
      })
      .catch((err) => {
        console.error("PayPal SDK error", err);
        setError(err.message || "Unable to load the PayPal SDK");
      });

    const container = paypalContainerRef.current;
    return () => {
      active = false;
      if (container) {
        container.innerHTML = "";
      }
      paypalRenderedRef.current = false;
    };
  }, [paypalInfo?.clientId, paypalInfo?.orderId, session?.sessionId, onSuccess, reloadSession]);

  const showPayPal = Boolean(paypalInfo?.clientId);

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
              <span>{formatCurrency(totalPriceEUR)}</span>
            </div>
          </div>

          {showStripe && (
            <div className="payment-provider-card">
              <h4>Card / Apple Pay / Google Pay</h4>
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

          {showPayPal && (
            <div className="payment-provider-card">
              <h4>PayPal</h4>
              <div ref={paypalContainerRef} style={{ minHeight: "60px" }} />
            </div>
          )}

          {!showStripe && !showPayPal && (
            <div className="payment-error">No payment methods are available right now.</div>
          )}

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
