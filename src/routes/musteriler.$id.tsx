import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "@/components/CustomerForm";
import { VehicleForm } from "@/components/VehicleForm";
import { ArchiveButton } from "@/components/ArchiveButton";
import { DeleteButton } from "@/components/DeleteButton";
import { useRepo } from "@/hooks/use-repo";
import { customerBalance, customerName, orderBalance, repo, vehiclesOfCustomer, workOrdersOfCustomer } from "@/lib/repository";
import { BalanceTable, PaymentBadge } from "@/components/Payments";
import { openServiceForm } from "@/lib/service-events";
import { displayPlate, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/musteriler/$id")({
  head: () => ({ meta: [{ title: "Müşteri detayı — Anatek" }, { name: "description", content: "Müşterinin araçları, servisleri ve bakiyesi." }, { property: "og:title", content: "Müşteri detayı — Anatek" }, { property: "og:description", content: "Müşterinin araçları, servisleri ve bakiyesi." }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const [edit, setEdit] = useState(false);
  const navigate = Route.useNavigate();
  const [addV, setAddV] = useState(false);
  const { data, ready } = useRepo(() => ({ c: repo.customers.get(id), v: vehiclesOfCustomer(id), w: workOrdersOfCustomer(id).map((w) => ({ w, b: orderBalance(w.id) })), b: customerBalance(id) }), { c: undefined, v: [], w: [], b: [] }, [id]);
  if (!ready) return null;
  const { c } = data;
  if (!c) return <p className="text-lg">Müşteri bulunamadı.</p>;
  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl font-bold">{customerName(c)}{c.archived && " (arşivde)"}</h1>
        <Button variant="outline" onClick={() => setEdit(true)}>Düzenle</Button>
        <ArchiveButton archived={c.archived} label="Müşteri" onArchive={() => repo.customers.archive(id)} onRestore={() => repo.customers.restore(id)} />
        <DeleteButton kind="customer" id={id} label={customerName(c)} onDeleted={() => navigate({ to: "/musteriler" })} />
      </div>
      <div className="text-lg">Telefon: <b>{c.phone}</b>{c.phone2 && <> · 2. telefon: <b>{c.phone2}</b></>}{c.address && <> · {c.address}</>}</div>
      {c.note && <p className="text-muted-foreground">{c.note}</p>}
      <div>
        <h2 className="mb-2 text-xl font-bold">Bakiye</h2>
        <BalanceTable rows={data.b} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xl font-bold">Araçlar</h2><Button onClick={() => setAddV(true)}>Araç ekle</Button></div>
        <ul className="grid gap-2">{data.v.map((v) => (<li key={v.id}><Link to="/araclar/$id" params={{ id: v.id }} className="font-semibold text-primary underline">{displayPlate(v.plate)}</Link> — {v.brand} {v.model} {v.year}</li>))}</ul>
      </div>
      <div>
        <h2 className="mb-2 text-xl font-bold">Geçmiş servisler</h2>
        {data.w.length === 0 ? <p className="text-muted-foreground">Henüz servis kaydı yok.</p> : <ul className="grid gap-2">{data.w.map(({ w, b }) => (
          <li key={w.id} className="flex flex-wrap items-center gap-2">
            <button type="button" className="font-semibold text-primary underline" onClick={() => openServiceForm(w.id)}>{w.orderNo}</button>
            <span>{formatDate(w.enteredAt)}{w.description ? ` — ${w.description}` : ""}</span>
            {b && <><PaymentBadge state={b.state} />{b.remaining > 0 && <span className="font-semibold text-destructive tabular-nums">Kalan: {formatMoney({ amount: b.remaining, currency: b.currency })}</span>}</>}
          </li>
        ))}</ul>}
      </div>
      <CustomerForm open={edit} onOpenChange={setEdit} customer={c} />
      <VehicleForm open={addV} onOpenChange={setAddV} customerId={id} />
    </section>
  );
}
