export type DisplayCurrency = "INR" | "USD";

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: DisplayCurrency, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
      currency,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: 2,
      style: "currency",
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Per-request provider costs are often a fraction of a rupee, so values under
 * one unit keep up to four decimals instead of rounding to "0.00".
 */
export function formatMoney(value: number, currency: DisplayCurrency) {
  const safe = Number.isFinite(value) ? value : 0;
  const magnitude = Math.abs(safe);
  const digits = magnitude > 0 && magnitude < 1 ? 4 : 2;
  return getFormatter(currency, digits).format(safe);
}

export function formatCount(value: number, fractionDigits = 0) {
  return (Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

export function formatPercent(value: number, fractionDigits = 1) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(fractionDigits)}%`;
}

/** Converts stored USD and INR amounts into the currency the page shows. */
export function createMoney(currency: DisplayCurrency, usdToInr: number) {
  const rate = Number.isFinite(usdToInr) && usdToInr > 0 ? usdToInr : 0;
  const fromUsd = (valueUsd: number) =>
    currency === "USD" ? valueUsd : valueUsd * rate;
  const fromInr = (valueInr: number) =>
    currency === "INR" ? valueInr : rate > 0 ? valueInr / rate : 0;
  return {
    currency,
    fromInr,
    fromUsd,
    inr: (valueInr: number) => formatMoney(fromInr(valueInr), currency),
    usd: (valueUsd: number) => formatMoney(fromUsd(valueUsd), currency),
    value: (value: number) => formatMoney(value, currency),
  };
}

export type Money = ReturnType<typeof createMoney>;
