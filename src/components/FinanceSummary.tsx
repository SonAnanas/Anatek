import { formatMoney } from "@/lib/money";
import type { PeriodSummary } from "@/lib/repository";

/** Kartlarda ve raporda yazan tanımlar. */
export const FINANCE_DEFINITIONS = {
  revenue: { label: "Ciro", def: "Bu dönemde açılan servislerin toplam tutarı." },
  collected: { label: "Tahsilat (gelir)", def: "Ödeme tarihine göre bu dönemde gerçekten alınan ödemeler. İptal/iade edilenler hariç." },
  pending: { label: "Bekleyen", def: "Bu dönemde açılan servislerden henüz ödenmemiş kalan borç." },
  partial: { label: "Kısmi ödeme", def: "Bekleyenin, bir kısmı ödenmiş servislerden kalan bölümü." },
  expense: { label: "Gider", def: "Bu dönemde kaydedilen giderler." },
  net: { label: "Net sonuç", def: "Tahsilat − gider." },
} as const;
type Key = Exclude<keyof typeof FINANCE_DEFINITIONS, "partial">;

/** Her para birimi için ayrı kart grubu. Para birimleri asla birleştirilmez. */
export function FinanceCards({ rows, keys = ["revenue", "collected", "pending", "expense", "net"] }: { rows: PeriodSummary[]; keys?: Key[] }) {
  return (
    <div className="grid gap-5">
      {rows.map((r) => (
        <div key={r.currency} className="grid gap-2" aria-label={`${r.currency} özeti`}>
          <h3 className="text-lg font-bold">{r.currency}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {keys.map((k) => {
              const v = r[k];
              const tone = k === "net" ? (v > 0 ? "text-success" : v < 0 ? "text-destructive" : "") : k === "pending" && v > 0 ? "text-destructive" : "";
              return (
                <div key={k} className="grid content-start gap-1 rounded-md border-2 bg-card p-4 text-card-foreground">
                  <div className="text-base font-semibold">{FINANCE_DEFINITIONS[k].label}</div>
                  <div className={`text-2xl font-bold tabular-nums ${tone}`}>{formatMoney({ amount: v, currency: r.currency })}</div>
                  <p className="text-sm text-muted-foreground">{FINANCE_DEFINITIONS[k].def}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
