/**
 * Currency helpers shared by the billing UI, the checkout session and the
 * audit viewer.
 *
 * Stripe always expresses amounts in the currency's smallest unit (cents for
 * USD, paise for INR, whole yen for JPY), so display code must not assume two
 * decimal places. Intl knows the exponent for every ISO currency.
 */

const FALLBACK_CURRENCY = "usd";

/** Accept any 3-letter ISO code; fall back instead of trusting env blindly. */
export function normalizeCurrency(value?: string | null): string {
  const currency = (value ?? "").trim().toLowerCase();
  return /^[a-z]{3}$/.test(currency) ? currency : FALLBACK_CURRENCY;
}

/** Number of decimal places a currency uses (USD 2, JPY 0, KWD 3). */
export function currencyFractionDigits(currency: string): number {
  try {
    const formatter = new Intl.NumberFormat("en", { style: "currency", currency: normalizeCurrency(currency) });
    return formatter.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Multiplier between major and smallest units (USD 100, JPY 1, KWD 1000). */
export function currencyMultiplier(currency: string): number {
  return 10 ** currencyFractionDigits(currency);
}

/**
 * Format a Stripe amount (smallest currency unit) for display.
 * Returns null when there is nothing sensible to show.
 */
export function formatAmountFromMinorUnits(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
  locale?: string
): string | null {
  if (amountMinor == null || !Number.isFinite(amountMinor)) return null;

  const code = normalizeCurrency(currency);

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(
      amountMinor / currencyMultiplier(code)
    );
  } catch {
    return null;
  }
}

/** Format the price of a credit pack (major units), e.g. "$1.00". */
export function formatCreditPrice(
  credits: number,
  currency: string | null | undefined,
  creditsPerUnit = 50,
  locale?: string
): string | null {
  const code = normalizeCurrency(currency);
  const price = credits / creditsPerUnit;

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(price);
  } catch {
    return null;
  }
}
