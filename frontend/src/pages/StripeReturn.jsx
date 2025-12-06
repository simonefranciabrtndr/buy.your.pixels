import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { acknowledgePayment } from "../api/checkout";

export default function StripeReturn() {
  const navigate = useNavigate();

  useEffect(() => {
    const finalize = async () => {
      const params = new URLSearchParams(window.location.search);
      const paymentIntent = params.get("payment_intent");
      const clientSecret = params.get("payment_intent_client_secret");
      const sessionId = params.get("session_id");

      if (!paymentIntent || !clientSecret) {
        return navigate("/failed", {
          state: { reason: "Invalid Stripe return data" },
        });
      }

      try {
        const stripe = window.Stripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
        const result = await stripe.retrievePaymentIntent(clientSecret);

        if (result?.paymentIntent?.status === "succeeded") {
          if (sessionId) {
            await acknowledgePayment(sessionId, "stripe", {
              paymentIntentId: paymentIntent,
            });
          }

          navigate(
            "/success?" +
              new URLSearchParams({
                order: sessionId || paymentIntent,
              }).toString()
          );
        } else {
          navigate("/failed", {
            state: { reason: "Payment not completed" },
          });
        }
      } catch (err) {
        navigate("/failed", {
          state: { reason: err.message || "Stripe Return Error" },
        });
      }
    };

    finalize();
  }, [navigate]);

  return (
    <div style={{ padding: "40px", color: "#fff" }}>
      Finalizing payment…
    </div>
  );
}
