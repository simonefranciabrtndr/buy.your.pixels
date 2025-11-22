import { createContext, useContext, useState } from "react";

export const FIXED_RATES = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.86,
};

const CurrencyContext = createContext();
const SUPPORTED = ["EUR", "USD", "GBP"];

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("EUR");
  const [rates] = useState(FIXED_RATES);

  function convertCurrency(eurValue, targetCurrency = currency, rateTable = rates) {
    const numeric = Number(eurValue) || 0;
    const rate = rateTable?.[targetCurrency] ?? 1;
    return numeric * rate;
  }

  function formatCurrency(value, targetCurrency = currency) {
    const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: targetCurrency,
    }).format(numeric);
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        selectedCurrency: currency,
        setCurrency,
        rates,
        convertCurrency,
        formatCurrency,
        SUPPORTED,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
