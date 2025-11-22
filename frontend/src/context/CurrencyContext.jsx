import { createContext, useContext, useState, useEffect } from "react";

const CurrencyContext = createContext();
const SUPPORTED = ["EUR", "USD", "GBP"];

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("EUR");
  const [rates, setRates] = useState({ EUR: 1 });

  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch("https://api.exchangerate.host/latest?base=EUR");
        const data = await res.json();
        if (data && data.rates) setRates(data.rates);
      } catch (err) {
        console.error("Currency fetch failed:", err);
      }
    }
    fetchRates();
    const timer = setInterval(fetchRates, 3600000);
    return () => clearInterval(timer);
  }, []);

  function convertCurrency(eurValue, targetCurrency = currency, rateTable = rates) {
    const numeric = Number(eurValue) || 0;
    const safeRates = rateTable || rates;
    const rate = safeRates?.[targetCurrency] ?? 1;
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
