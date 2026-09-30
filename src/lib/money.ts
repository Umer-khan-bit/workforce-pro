export type CurrencySetting = { code: string; locale: string };

/** Formats an amount using the currency chosen in Settings, e.g. "PKR 15,000". */
export function formatMoney(amount: number, currency: CurrencySetting): string {
  return `${currency.code} ${amount.toLocaleString(currency.locale)}`;
}
