// Tarih aralıkları (yerel saat). Aralık [from, to) — bitiş hariç.
export type PeriodKey = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "thisYear" | "custom";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Bugün" }, { key: "yesterday", label: "Dün" },
  { key: "thisWeek", label: "Bu hafta" }, { key: "lastWeek", label: "Geçen hafta" },
  { key: "thisMonth", label: "Bu ay" }, { key: "lastMonth", label: "Geçen ay" },
  { key: "thisYear", label: "Bu yıl" }, { key: "custom", label: "Özel aralık" },
];
export type Range = { from: Date; to: Date };

const day = (y: number, m: number, d: number) => new Date(y, m, d);
/** "2026-03-05" -> yerel gün başlangıcı */
export const parseLocalDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return day(y!, (m ?? 1) - 1, d ?? 1); };
export const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Hafta pazartesi başlar. Özel aralıkta başlangıç ve bitiş günü dahildir. */
export function periodRange(key: PeriodKey, now = new Date(), custom?: { from: string; to: string }): Range {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const monday = d - ((now.getDay() + 6) % 7);
  switch (key) {
    case "today": return { from: day(y, m, d), to: day(y, m, d + 1) };
    case "yesterday": return { from: day(y, m, d - 1), to: day(y, m, d) };
    case "thisWeek": return { from: day(y, m, monday), to: day(y, m, monday + 7) };
    case "lastWeek": return { from: day(y, m, monday - 7), to: day(y, m, monday) };
    case "thisMonth": return { from: day(y, m, 1), to: day(y, m + 1, 1) };
    case "lastMonth": return { from: day(y, m - 1, 1), to: day(y, m, 1) };
    case "thisYear": return { from: day(y, 0, 1), to: day(y + 1, 0, 1) };
    case "custom": {
      if (!custom?.from || !custom?.to) return { from: day(y, m, d), to: day(y, m, d + 1) };
      let a = parseLocalDate(custom.from), b = parseLocalDate(custom.to);
      if (b < a) [a, b] = [b, a];
      return { from: a, to: day(b.getFullYear(), b.getMonth(), b.getDate() + 1) };
    }
  }
}
export const inRange = (iso: string | undefined, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
};
export const rangeLabel = (r: Range) => {
  const last = new Date(r.to.getTime() - 1);
  const f = (x: Date) => x.toLocaleDateString("tr-TR");
  return f(r.from) === f(last) ? f(r.from) : `${f(r.from)} – ${f(last)}`;
};

// ---- Rapor kırılımları (gün/hafta/ay/yıl) ----
export type BucketUnit = "day" | "week" | "month" | "year";
export const BUCKET_LABEL: Record<BucketUnit, string> = { day: "Gün", week: "Hafta", month: "Ay", year: "Yıl" };
export type Bucket = Range & { label: string };
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Aralığı birimlere böler; ilk ve son dilim aralık sınırına kırpılır. Hafta pazartesi başlar. */
export function splitRange(r: Range, unit: BucketUnit, max = 1000): Bucket[] {
  const f = r.from;
  let s = unit === "day" ? day(f.getFullYear(), f.getMonth(), f.getDate())
    : unit === "week" ? day(f.getFullYear(), f.getMonth(), f.getDate() - ((f.getDay() + 6) % 7))
    : unit === "month" ? day(f.getFullYear(), f.getMonth(), 1)
    : day(f.getFullYear(), 0, 1);
  const out: Bucket[] = [];
  while (s < r.to && out.length < max) {
    const y = s.getFullYear(), m = s.getMonth(), d = s.getDate();
    const n = unit === "day" ? day(y, m, d + 1) : unit === "week" ? day(y, m, d + 7) : unit === "month" ? day(y, m + 1, 1) : day(y + 1, 0, 1);
    const from = s < r.from ? r.from : s, to = n > r.to ? r.to : n;
    const label = unit === "day" ? from.toLocaleDateString("tr-TR") : unit === "week" ? rangeLabel({ from, to }) : unit === "month" ? `${MONTHS[m]} ${y}` : String(y);
    out.push({ from, to, label });
    s = n;
  }
  return out;
}
