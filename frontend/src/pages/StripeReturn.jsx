import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { acknowledgePayment } from "../api/checkout";

export default function StripeReturn() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    const redirectStatus = params.get("redirect_status");
    const sessionId = params.get("session") || params.get("state");

    if (!paymentIntentId || !sessionId || redirectStatus !== "succeeded") {
      navigate("/failed", {
        replace: true,
        state: { reason: "Stripe redirect payment failed" },
      });
      return;
    }

    acknowledgePayment(sessionId, "stripe", { paymentIntentId })
      .catch(() => {})
      .finally(() => {
        const query = new URLSearchParams({ order: sessionId }).toString();
        navigate(`/success?${query}`, {
          replace: true,
          state: { orderId: sessionId },
        });
      });
  }, [navigate]);

  return (
    <div className="payment-step">
      <h3>Finalizing payment…</h3>
      <p className="payment-step-sub">Please wait while we confirm your transaction.</p>
      <div className="payment-loader">Checking payment status…</div>
    </div>
  );
}
