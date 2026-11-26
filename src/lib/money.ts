import type { Currency, Money } from "./types";

export const CURRENCIES: Currency[] = ["TRY", "USD", "EUR"];

export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) throw new Error("Tutar kuruş cinsinden tam sayı olmalı");
  return { amount, currency };
}

/** Aynı para birimindeki tutarları toplar; farklı birimde hata verir. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error("Farklı para birimleri toplanamaz");
  return { amount: a.amount + b.amount, currency: a.currency };
}

/** Para birimine göre ayrı toplamlar döndürür (asla tek sayıya indirgenmez). */
export function totalsByCurrency(items: Money[]): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = {};
  for (const m of items) out[m.currency] = (out[m.currency] ?? 0) + m.amount;
  return out;
}

export function formatMoney(m: Money): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: m.currency }).format(m.amount / 100);
}
