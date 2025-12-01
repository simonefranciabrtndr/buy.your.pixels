import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Failed.css";

export default function FailedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const reason = location.state?.reason || "Your transaction could not be completed.";

  const handleRetry = () => {
    navigate("/", { replace: true });
  };

  return (
    <div className="failed-page">
      <div className="failed-overlay" />
      <div className="failed-card">
        <div className="failed-icon">
          <span>×</span>
        </div>
        <h1 className="failed-title">Payment failed</h1>
        <p className="failed-subtitle">Something went wrong while processing your payment.</p>
        <p className="failed-reason">{reason}</p>
        <div className="failed-actions">
          <button className="btn-primary" onClick={handleRetry}>
            Try again
          </button>
          <button className="btn-secondary" onClick={() => navigate("/", { replace: true })}>
            Back to home
          </button>
        </div>
        <div className="failed-hint">
          If this keeps happening, contact support@yourpixels.online
        </div>
      </div>
    </div>
  );
}
