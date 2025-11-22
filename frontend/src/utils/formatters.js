import { useCurrency } from "../context/CurrencyContext";

export function useCurrencyFormatter() {
  const { currency, formatCurrency: ctxFormatCurrency } = useCurrency();

  function formatCurrency(value, targetCurrency = currency) {
    return ctxFormatCurrency(value, targetCurrency);
  }

  function formatCurrencyEUR(value) {
    return ctxFormatCurrency(value, "EUR");
  }

  return { formatCurrency, formatCurrencyEUR };
}
