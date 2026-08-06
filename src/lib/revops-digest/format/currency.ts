// JS has no built-in way to infer a locale from a currency code alone, so this is an explicit
// map. Add a row here whenever a new client needs a currency not yet listed — everything else
// (email table, Slack blocks, ClickUp descriptions) calls formatCurrency() and needs no changes.
const CURRENCY_LOCALE_MAP: Record<string, string> = {
  USD: "en-US",
  BRL: "pt-BR",
  CAD: "en-CA",
  EUR: "de-DE",
  GBP: "en-GB",
};

export function formatCurrency(amount: number, currencyCode: string): string {
  const locale = CURRENCY_LOCALE_MAP[currencyCode] ?? "en-US";
  // No fraction-digit override — Intl applies each currency's own convention (e.g. 2 decimal
  // places for USD/BRL/EUR/GBP/CAD), which is the point of locale-native formatting.
  return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(amount);
}
