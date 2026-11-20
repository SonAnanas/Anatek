import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/Field";
import { useRepo } from "@/hooks/use-repo";
import { customerName, listStatuses, orderBalance, repo, type OrderBalance } from "@/lib/repository";
import { displayPlate, formatDate } from "@/lib/format";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { normalizePlate, trLower } from "@/lib/normalize";
import { openServiceForm } from "@/lib/service-events";
import type { Currency, ServiceStatus, WorkOrder } from "@/lib/types";

export const Route = createFileRoute("/odemeler")({
  head: () => ({
    meta: [
      { title: "Ödemeler ve borçlar — Anatek" },
      { name: "description", content: "Ödenmemiş servisler, alınan ödemeler ve kalan borçlar." },
      { property: "og:title", content: "Ödemeler ve borçlar — Anatek" },
      { property: "og:description", content: "Ödenmemiş servisler, alınan ödemeler ve kalan borçlar." },
    ],
  }),
  component: Page,
});

type Row = { w: WorkOrder; customer: string; phone: string; plate: string; status?: ServiceStatus | undefined; b: OrderBalance };
type SortKey = "customer" | "plate" | "date" | "total" | "paid" | "remaining" | "status" | "lastPaid";

function load(): { rows: Row[]; statuses: ServiceStatus[] } {
  const all = listStatuses(true);
  const rows: Row[] = [];
  for (const w of repo.workOrders.list()) {
    const b = orderBalance(w.id);
    if (!b || b.remaining <= 0) continue; // yalnızca borcu kalan servisler
    const c = repo.customers.get(w.customerId), v = repo.vehicles.get(w.vehicleId);
    rows.push({ w, b, customer: c ? customerName(c) : "—", phone: c?.phone ?? "", plate: v?.plate ?? "", status: all.find((s) => s.id === w.statusId) });
  }
  return { rows, statuses: listStatuses() };
}

const COLS: { key: SortKey; label: string; amount?: boolean }[] = [
  { key: "customer", label: "Müşteri" }, { key: "plate", label: "Plaka" }, { key: "date", label: "Servis tarihi" },
  { key: "total", label: "Toplam", amount: true }, { key: "paid", label: "Ödenen", amount: true }, { key: "remaining", label: "Kalan borç", amount: true },
  { key: "status", label: "İşlem durumu" }, { key: "lastPaid", label: "Son ödeme" },
];

function compare(a: Row, b: Row, k: SortKey): number {
  switch (k) {
    case "customer": return a.customer.localeCompare(b.customer, "tr");
    case "plate": return a.plate.localeCompare(b.plate);
    case "date": return a.w.enteredAt.localeCompare(b.w.enteredAt);
    case "status": return (a.status?.order ?? 0) - (b.status?.order ?? 0);
    case "lastPaid": return (a.b.lastPaidAt ?? "").localeCompare(b.b.lastPaidAt ?? "");
    // Tutarlar: önce para birimi, sonra tutar (farklı birimler karşılaştırılmaz).
    default: return a.b.currency.localeCompare(b.b.currency) || a.b[k] - b.b[k];
  }
}

function Page() {
  const { data } = useRepo(load, { rows: [], statuses: [] });
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<"" | Currency>("");
  const [st, setSt] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const ql = trLower(q.trim()), qp = normalizePlate(q);
  const rows = data.rows
    .filter((r) => !ql || trLower(r.customer).includes(ql) || (qp && r.plate.includes(qp)) || (q.replace(/\D/g, "").length > 2 && r.phone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))))
    .filter((r) => !cur || r.b.currency === cur)
    .filter((r) => !st || r.w.statusId === st)
    .sort((a, b) => compare(a, b, sort.key) * sort.dir);

  // Para birimi bazında ayrı kalan borç toplamları (asla tek toplamda birleştirilmez).
  const sums = CURRENCIES.map((c) => ({ c, n: rows.filter((r) => r.b.currency === c).length, sum: rows.filter((r) => r.b.currency === c).reduce((t, r) => t + r.b.remaining, 0) })).filter((x) => x.n > 0);
  const toggle = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));

  return (
    <section className="grid gap-4">
      <h1 className="text-3xl font-bold">Ödemeler ve borçlar</h1>
      <p className="text-muted-foreground">Borcu kalan servisler. Tahsilat uygulama dışında yapılır; ödeme kaydı servis detayından eklenir.</p>

      <div className="flex flex-wrap gap-3">
        {sums.length === 0 ? <p className="text-lg font-semibold">Borcu kalan servis yok.</p> : sums.map((s) => (
          <div key={s.c} className="rounded-md border-2 bg-card px-4 py-3">
            <div className="text-sm text-muted-foreground">Kalan borç · {s.c} · {s.n} servis</div>
            <div className="text-2xl font-bold tabular-nums text-destructive">{formatMoney({ amount: s.sum, currency: s.c })}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input className="h-11 w-full text-base sm:max-w-sm" placeholder="Müşteri, telefon veya plaka ile süz" aria-label="Müşteri veya plaka" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="w-full sm:w-56"><select aria-label="Para birimi" className={selectCls} value={cur} onChange={(e) => setCur(e.target.value as "" | Currency)}>
          <option value="">Tüm para birimleri</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select></div>
        <div className="w-full sm:w-64"><select aria-label="İşlem durumu" className={selectCls} value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Tüm işlem durumları</option>
          {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select></div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-base [&_td]:px-2 [&_td]:whitespace-nowrap [&_th]:px-2 [&_th]:whitespace-nowrap">
          <thead>
            <tr className="border-b-2 text-left">
              {COLS.slice(0, 1).map((c) => <SortTh key={c.key} c={c} sort={sort} onClick={toggle} />)}
              <th className="py-2">Telefon</th>
              {COLS.slice(1).map((c) => <SortTh key={c.key} c={c} sort={sort} onClick={toggle} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.w.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => openServiceForm(r.w.id)} title={`${r.w.orderNo} — ödeme kaydı eklemek için açın`}>
                <td className="py-3 font-semibold">{r.customer}</td>
                <td className="whitespace-nowrap">{r.phone}</td>
                <td className="whitespace-nowrap text-lg font-bold tracking-wider">{displayPlate(r.plate)}</td>
                <td>{formatDate(r.w.enteredAt)}</td>
                <td className="amount whitespace-nowrap">{formatMoney({ amount: r.b.total, currency: r.b.currency })}</td>
                <td className="amount whitespace-nowrap">{formatMoney({ amount: r.b.paid, currency: r.b.currency })}</td>
                <td className="amount whitespace-nowrap font-bold text-destructive">{formatMoney({ amount: r.b.remaining, currency: r.b.currency })}</td>
                <td className="pl-4">{r.status?.label ?? "—"}</td>
                <td>{r.b.lastPaidAt ? formatDate(r.b.lastPaidAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length > 0 && rows.length === 0 && <p className="mt-3 text-muted-foreground">Filtreye uyan kayıt yok.</p>}
      </div>
    </section>
  );
}

function SortTh({ c, sort, onClick }: { c: (typeof COLS)[number]; sort: { key: SortKey; dir: 1 | -1 }; onClick: (k: SortKey) => void }) {
  const on = sort.key === c.key;
  return (
    <th className={`py-2 ${c.amount ? "amount" : c.key === "status" ? "pl-4" : ""}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="font-bold underline-offset-4 hover:underline" onClick={() => onClick(c.key)}>
        {c.label}{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}
