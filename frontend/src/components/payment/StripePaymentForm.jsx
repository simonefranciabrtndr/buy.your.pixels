import React, { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export default function StripePaymentForm({ onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (error) {
        setMessage(error.message || "Unable to complete payment");
        onError?.(error);
        return;
      }
      if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "requires_capture") {
        onSuccess?.({ paymentIntent });
      } else {
        setMessage(`Payment status: ${paymentIntent?.status ?? "unknown"}`);
      }
    } catch (err) {
      setMessage(err.message || "Unexpected error");
      onError?.(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-payment-form">
      <PaymentElement options={{ layout: "tabs" }} />
      {message && <div className="payment-error" role="alert">{message}</div>}
      <button type="submit" className="popup-continue" disabled={!stripe || submitting}>
        {submitting ? "Processing…" : "Pay with card / wallet"}
      </button>
    </form>
  );
}
