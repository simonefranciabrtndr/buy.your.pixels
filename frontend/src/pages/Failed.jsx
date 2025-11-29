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
    <div className="failed-wrapper">
      <div className="failed-card">
        <h1>Payment Failed</h1>
        <p>{reason}</p>
        <div className="failed-actions">
          <button className="btn-primary" onClick={handleRetry}>
            Try again
          </button>
          <a className="btn-secondary" href="mailto:support@yourpixels.online">
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
