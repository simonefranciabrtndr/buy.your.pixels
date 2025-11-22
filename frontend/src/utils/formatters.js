import { useCurrency } from "../context/CurrencyContext";

export function useCurrencyFormatter() {
  const { currency, convert } = useCurrency();

  function formatCurrency(valueEUR) {
    const converted = convert(valueEUR);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(converted);
  }

  function formatCurrencyEUR(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  }

  return { formatCurrency, formatCurrencyEUR };
}
