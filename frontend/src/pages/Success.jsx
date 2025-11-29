import React, { useEffect, useMemo } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import "./Success.css";

export default function SuccessPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const stateData = location.state || {};
  const orderId = params.get("order");
  const queryValue = params.get("value");
  const queryPixels = params.get("pixels");

  const { totalEUR, pixelCount, transactionId } = useMemo(() => {
    const txId = stateData.orderId || orderId || params.get("transaction_id") || null;
    const value =
      typeof stateData.value === "number"
        ? stateData.value
        : queryValue
        ? Number(queryValue)
        : null;
    const pixels =
      typeof stateData.pixels === "number"
        ? stateData.pixels
        : queryPixels
        ? Number(queryPixels)
        : null;
    return {
      totalEUR: Number.isFinite(value) ? value : null,
      pixelCount: Number.isFinite(pixels) ? pixels : null,
      transactionId: txId,
    };
  }, [stateData, orderId, params, queryValue, queryPixels]);

  // Fire tracking events (Meta + GA4)
  useEffect(() => {
    const valueToSend = Number.isFinite(totalEUR) ? totalEUR : 0;
    const qty = Number.isFinite(pixelCount) ? pixelCount : 1;

    if (typeof window !== "undefined" && typeof window.gtag === "function" && transactionId) {
      window.gtag("event", "purchase", {
        transaction_id: transactionId,
        value: valueToSend,
        currency: "EUR",
        items: [
          {
            item_id: "pixel_block",
            item_name: "Pixel Purchase",
            quantity: qty,
          },
        ],
      });
    }

    if (typeof window !== "undefined" && typeof window.fbq === "function" && transactionId) {
      window.fbq("track", "Purchase", {
        value: valueToSend,
        currency: "EUR",
        contents: [
          {
            id: "pixel_block",
            quantity: qty,
          },
        ],
      });
    }
  }, [totalEUR, pixelCount, transactionId]);

  return (
    <div className="success-wrapper">
      <div className="success-card glass-popup">
        <h1>Payment Successful 🎉</h1>
        <p>Your pixels have been successfully purchased.</p>

        {transactionId && (
          <p className="order-ref">
            Order reference: <strong>{transactionId}</strong>
          </p>
        )}

        {Number.isFinite(totalEUR) && (
          <p className="order-ref">
            Total paid: <strong>€{totalEUR.toFixed(2)}</strong>
          </p>
        )}

        {Number.isFinite(pixelCount) && (
          <p className="order-ref">
            Pixels purchased: <strong>{Math.round(pixelCount).toLocaleString()}</strong>
          </p>
        )}

        <a href="/" className="btn-primary">
          Back to homepage
        </a>
      </div>
    </div>
  );
}
