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

  function convert(amountEUR, to = currency) {
    if (!rates[to]) return amountEUR;
    return amountEUR * rates[to];
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, convert, SUPPORTED }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
