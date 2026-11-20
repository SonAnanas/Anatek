import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRepo } from "@/hooks/use-repo";
import { customerName, listStatuses, orderBalance, orderTotal, repo, setOrderStatus, type PaymentState } from "@/lib/repository";
import { PaymentBadge } from "@/components/Payments";
import { DeleteButton } from "@/components/DeleteButton";
import { displayPlate, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { normalizePlate, trLower } from "@/lib/normalize";
import { openServiceForm } from "@/lib/service-events";
import type { ServiceStatus, WorkOrder } from "@/lib/types";

export const Route = createFileRoute("/servis")({
  head: () => ({
    meta: [
      { title: "Servis işlemleri — Anatek" },
      { name: "description", content: "İş emirlerini Kanban veya liste görünümünde takip edin." },
      { property: "og:title", content: "Servis işlemleri — Anatek" },
      { property: "og:description", content: "İş emirlerini Kanban veya liste görünümünde takip edin." },
    ],
  }),
  component: Page,
});

type Row = { w: WorkOrder; plate: string; brand: string; customer: string; status?: ServiceStatus | undefined; total: number; employee: string; pay: PaymentState };

function load(): { rows: Row[]; statuses: ServiceStatus[] } {
  const statuses = listStatuses();
  const all = listStatuses(true);
  const rows = repo.workOrders.list().map((w) => {
    const v = repo.vehicles.get(w.vehicleId), c = repo.customers.get(w.customerId);
    return {
      w, plate: v?.plate ?? "", brand: v ? `${v.brand} ${v.model}` : "", customer: c ? customerName(c) : "—",
      status: all.find((s) => s.id === w.statusId), total: orderTotal(w.id, w.currency),
      employee: w.employeeId ? repo.employees.get(w.employeeId)?.name ?? "" : "",
      pay: orderBalance(w.id)?.state ?? "unpaid",
    };
  }).sort((a, b) => b.w.enteredAt.localeCompare(a.w.enteredAt));
  return { rows, statuses };
}

function Page() {
  const [view, setView] = useState<"kanban" | "list" | "history">("kanban");
  const [q, setQ] = useState("");
  const { data } = useRepo(load, { rows: [], statuses: [] });
  const ql = trLower(q.trim()), qp = normalizePlate(q);
  const match = (r: Row) => !ql || r.plate.includes(qp) || trLower(r.customer).includes(ql) || trLower(r.w.orderNo).includes(ql);
  const active = data.rows.filter((r) => r.status?.kind === "active" && match(r));
  const history = data.rows.filter((r) => r.status?.kind !== "active" && match(r))
    .sort((a, b) => (b.w.completedAt ?? b.w.enteredAt).localeCompare(a.w.completedAt ?? a.w.enteredAt));

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl font-bold">Servis işlemleri</h1>
        <div role="tablist" className="flex rounded-md border-2 p-1">
          {([["kanban", "Kanban"], ["list", "Liste"], ["history", `Geçmiş (${data.rows.filter((r) => r.status?.kind !== "active").length})`]] as const).map(([k, l]) => (
            <Button key={k} role="tab" aria-selected={view === k} variant={view === k ? "default" : "ghost"} onClick={() => setView(k)}>{l}</Button>
          ))}
        </div>
        <Button size="lg" onClick={() => openServiceForm()} title="Ctrl+N">Yeni servis</Button>
      </div>
      <Input className="h-11 max-w-md text-base" placeholder="Plaka, müşteri veya iş emri no ile süz" value={q} onChange={(e) => setQ(e.target.value)} />

      {view === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {data.statuses.filter((s) => s.kind === "active").map((s) => {
            const col = active.filter((r) => r.w.statusId === s.id);
            return (
              <div key={s.id} className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border-2 bg-muted/50 p-3"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id) setOrderStatus(id, s.id); }}>
                <h2 className="flex justify-between text-lg font-bold"><span>{s.label}</span><span className="text-muted-foreground">{col.length}</span></h2>
                {col.map((r) => <Card key={r.w.id} r={r} statuses={data.statuses} />)}
                {col.length === 0 && <p className="text-sm text-muted-foreground">Boş</p>}
              </div>
            );
          })}
        </div>
      )}

      {view !== "kanban" && (
        <table className="w-full text-base">
          <thead><tr className="border-b-2 text-left"><th className="py-2">No</th><th>Plaka</th><th>Müşteri</th><th>Giriş</th><th>{view === "history" ? "Tamamlanma" : "Tahmini teslim"}</th><th>Durum</th><th className="amount">Toplam</th><th></th></tr></thead>
          <tbody>
            {(view === "list" ? active : history).map((r) => (
              <tr key={r.w.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => openServiceForm(r.w.id)}>
                <td className="py-3 font-semibold text-primary underline">{r.w.orderNo}</td>
                <td className="text-lg font-bold tracking-wider">{displayPlate(r.plate)}</td>
                <td>{r.customer}</td>
                <td>{formatDate(r.w.enteredAt)}</td>
                <td>{view === "history" ? (r.w.completedAt ? formatDate(r.w.completedAt) : "—") : (r.w.expectedAt ? formatDate(r.w.expectedAt) : "—")}</td>
                <td>{r.status?.label}</td>
                <td className="amount font-semibold">{formatMoney({ amount: r.total, currency: r.w.currency })}</td>
                <td className="text-right" onClick={(e) => e.stopPropagation()}><DeleteButton kind="workOrder" id={r.w.id} label={r.w.orderNo} size="sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view !== "kanban" && (view === "list" ? active : history).length === 0 && <p className="text-muted-foreground">Kayıt yok.</p>}
    </section>
  );
}

function Card({ r, statuses }: { r: Row; statuses: ServiceStatus[] }) {
  const late = r.w.expectedAt && r.w.expectedAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
  return (
    <article draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", r.w.id)}
      className="grid cursor-pointer gap-1 rounded-md border-2 bg-card p-3 text-card-foreground shadow-sm hover:border-primary"
      onClick={() => openServiceForm(r.w.id)}>
      <div className="text-2xl font-bold tracking-wider">{displayPlate(r.plate)}</div>
      <div className="font-semibold">{r.customer}</div>
      <div className="text-sm text-muted-foreground">{r.brand} · {r.w.orderNo}{r.employee && ` · ${r.employee}`}</div>
      <div><PaymentBadge state={r.pay} /></div>
      {r.w.expectedAt && <div className={`text-sm ${late ? "font-bold text-destructive" : "text-muted-foreground"}`}>Teslim: {formatDate(r.w.expectedAt)}</div>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <b className="text-lg tabular-nums">{formatMoney({ amount: r.total, currency: r.w.currency })}</b>
        <select aria-label="Durumu değiştir" className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          value={r.w.statusId} onClick={(e) => e.stopPropagation()} onChange={(e) => setOrderStatus(r.w.id, e.target.value)}>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
    </article>
  );
}
