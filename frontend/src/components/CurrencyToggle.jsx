import React from "react";
import { useCurrency } from "../context/CurrencyContext";
import "./CurrencyToggle.css";

const FLAG_MAP = {
  EUR: "🇪🇺",
  USD: "🇺🇸",
  GBP: "🇬🇧",
};

export default function CurrencyToggle() {
  const { selectedCurrency, currency, setCurrency, SUPPORTED } = useCurrency();
  const activeCurrency = selectedCurrency || currency || "EUR";

  return (
    <div className="currency-toggle" role="group" aria-label="Select currency">
      {SUPPORTED.map((code) => {
        const isActive = code === activeCurrency;
        return (
          <button
            key={code}
            type="button"
            className={`currency-toggle-option${isActive ? " active" : ""}`}
            onClick={() => setCurrency(code)}
          >
            <span className="currency-flag" aria-hidden="true">
              {FLAG_MAP[code] || "🌐"}
            </span>
            <span className="currency-label">{code}</span>
          </button>
        );
      })}
    </div>
  );
}
