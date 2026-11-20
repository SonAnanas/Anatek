/** "34 abc 123" -> "34ABC123" */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}
/** Telefonu karşılaştırma için son 10 haneye indirger: "0532 111 22 33" = "+90 532 1112233" */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(-10);
}
/** Türkçe duyarlı küçük harf (İ/ı doğru) */
export function trLower(s: string): string {
  return s.toLocaleLowerCase("tr-TR");
}
