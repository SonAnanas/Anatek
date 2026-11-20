import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "@/components/ArchiveButton";
import { ExpenseForm } from "@/components/ExpenseForm";
import { FinanceCards } from "@/components/FinanceSummary";
import { PeriodFilter, usePeriod } from "@/components/PeriodFilter";
import { useRepo } from "@/hooks/use-repo";
import { collectionsIn, customerName, expensesIn, paymentMethodLabel, periodSummary, repo } from "@/lib/repository";
import { displayPlate, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { openServiceForm } from "@/lib/service-events";

export const Route = createFileRoute("/gelir-gider")({
  head: () => ({
    meta: [
      { title: "Gelir ve giderler — Anatek" },
      { name: "description", content: "Dönemlik tahsilat, ciro, gider ve net sonuç; para birimine göre ayrı." },
      { property: "og:title", content: "Gelir ve giderler — Anatek" },
      { property: "og:description", content: "Dönemlik tahsilat, ciro, gider ve net sonuç; para birimine göre ayrı." },
    ],
  }),
  component: Page,
});

function Page() {
  const period = usePeriod("thisMonth");
  const [add, setAdd] = useState(false);
  const r = period.range;
  const { data } = useRepo(() => ({
    summary: periodSummary(r),
    expenses: expensesIn(r),
    collections: collectionsIn(r).map((p) => {
      const w = repo.workOrders.get(p.workOrderId), c = repo.customers.get(p.customerId), v = w && repo.vehicles.get(w.vehicleId);
      return { p, orderNo: w?.orderNo ?? "—", customer: c ? customerName(c) : "—", plate: v?.plate ?? "" };
    }),
  }), { summary: [], expenses: [], collections: [] }, [r.from.getTime(), r.to.getTime()]);

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl font-bold">Gelir ve giderler</h1>
        <Button size="lg" onClick={() => setAdd(true)}>Gider ekle</Button>
      </div>
      <PeriodFilter state={period} />
      <FinanceCards rows={data.summary} />

      <div className="grid gap-2">
        <h2 className="text-xl font-bold">Giderler ({data.expenses.length})</h2>
        {data.expenses.length === 0 ? <p className="text-muted-foreground">Bu dönemde gider yok.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-base [&_td]:px-2 [&_th]:px-2">
              <thead><tr className="border-b-2 text-left"><th className="py-2">Tarih</th><th>Kategori</th><th>Açıklama</th><th>Ödeme yöntemi</th><th className="amount">Tutar</th><th /></tr></thead>
              <tbody>{data.expenses.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="whitespace-nowrap py-2">{formatDate(e.spentAt)}</td>
                  <td>{e.category}</td>
                  <td>{e.description ?? "—"}</td>
                  <td>{paymentMethodLabel(e.method)}</td>
                  <td className="amount whitespace-nowrap font-semibold">{formatMoney(e.money)}</td>
                  <td className="py-1 text-right"><ArchiveButton archived={e.archived} label="Gider" onArchive={() => repo.expenses.archive(e.id)} onRestore={() => repo.expenses.restore(e.id)} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <h2 className="text-xl font-bold">Tahsilatlar ({data.collections.length})</h2>
        <p className="text-sm text-muted-foreground">Ödeme tarihine göre bu dönemde alınan geçerli ödemeler. Satıra tıklayınca servis açılır.</p>
        {data.collections.length === 0 ? <p className="text-muted-foreground">Bu dönemde tahsilat yok.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-base [&_td]:px-2 [&_th]:px-2">
              <thead><tr className="border-b-2 text-left"><th className="py-2">Tarih</th><th>Servis</th><th>Müşteri</th><th>Plaka</th><th>Ödeme yöntemi</th><th className="amount">Tutar</th></tr></thead>
              <tbody>{data.collections.map(({ p, orderNo, customer, plate }) => (
                <tr key={p.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => openServiceForm(p.workOrderId)}>
                  <td className="whitespace-nowrap py-2">{formatDate(p.paidAt)}</td>
                  <td className="whitespace-nowrap font-semibold text-primary underline">{orderNo}</td>
                  <td>{customer}</td>
                  <td className="whitespace-nowrap font-bold tracking-wider">{displayPlate(plate)}</td>
                  <td>{paymentMethodLabel(p.method)}</td>
                  <td className="amount whitespace-nowrap font-semibold">{formatMoney(p.money)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <ExpenseForm open={add} onOpenChange={setAdd} />
    </section>
  );
}
