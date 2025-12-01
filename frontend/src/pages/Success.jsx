import React, { useEffect, useMemo } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import "./Success.css";

export default function SuccessPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
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

  const orderRef = transactionId || params.get("orderRef") || "#ThankYou";

  return (
    <div className="success-page">
      <div className="success-overlay" />
      <div className="success-card">
        <div className="success-icon">
          <span>✓</span>
        </div>
        <h1 className="success-title">Payment successful</h1>
        <p className="success-subtitle">Your pixels are now live on the Wall.</p>

        <div className="success-summary">
          <div className="summary-item">
            <div className="summary-label">Order ref</div>
            <div className="summary-value">{orderRef}</div>
          </div>
          {Number.isFinite(totalEUR) && (
            <div className="summary-item">
              <div className="summary-label">Total paid</div>
              <div className="summary-value">€{totalEUR.toFixed(2)}</div>
            </div>
          )}
          {Number.isFinite(pixelCount) && (
            <div className="summary-item">
              <div className="summary-label">Pixels</div>
              <div className="summary-value">{Math.round(pixelCount).toLocaleString()}</div>
            </div>
          )}
        </div>

        <div className="success-actions">
          <a className="btn-primary" href="https://yourpixels.online">
            View your pixels
          </a>
          <button className="btn-secondary" onClick={() => navigate("/", { replace: true })}>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
