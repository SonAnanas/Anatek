import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "@/components/VehicleForm";
import { ArchiveButton } from "@/components/ArchiveButton";
import { DeleteButton } from "@/components/DeleteButton";
import { useRepo } from "@/hooks/use-repo";
import { customerBalance, customerName, orderBalance, remindersOfVehicle, repo, workOrdersOfVehicle } from "@/lib/repository";
import { ReminderForm, ReminderRow } from "@/components/ReminderForm";
import { toast } from "sonner";
import { BalanceTable, PaymentBadge } from "@/components/Payments";
import { openServiceForm } from "@/lib/service-events";
import { displayPlate, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/araclar/$id")({
  head: () => ({ meta: [{ title: "Araç detayı — Anatek" }, { name: "description", content: "Araç, sahibi ve servis geçmişi." }, { property: "og:title", content: "Araç detayı — Anatek" }, { property: "og:description", content: "Araç, sahibi ve servis geçmişi." }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const [edit, setEdit] = useState(false);
  const navigate = Route.useNavigate();
  const { data, ready } = useRepo(() => { const v = repo.vehicles.get(id); return { v, c: v && repo.customers.get(v.customerId), w: workOrdersOfVehicle(id).map((w) => ({ w, b: orderBalance(w.id) })), b: v ? customerBalance(v.customerId, v.id) : [] }; }, { v: undefined, c: undefined, w: [], b: [] }, [id]);
  const { data: reminders } = useRepo(() => remindersOfVehicle(id), [], [id]);
  const [remOpen, setRemOpen] = useState(false);
  if (!ready) return null;
  const { v, c } = data;
  if (!v) return <p className="text-lg">Araç bulunamadı.</p>;
  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-4xl font-bold tracking-wider">{displayPlate(v.plate)}{v.archived && " (arşivde)"}</h1>
        <Button variant="outline" onClick={() => setEdit(true)}>Düzenle</Button>
        <ArchiveButton archived={v.archived} label="Araç" onArchive={() => repo.vehicles.archive(id)} onRestore={() => { try { repo.vehicles.restore(id); } catch (e) { toast.error(e instanceof Error ? e.message : "Geri alınamadı"); } }} />
        <DeleteButton kind="vehicle" id={id} label={displayPlate(v.plate)} onDeleted={() => navigate({ to: "/araclar" })} />
      </div>
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-2 text-lg">
        <dt className="text-muted-foreground">Araç</dt><dd>{v.brand} {v.model} {v.year} · {v.type}</dd>
        {v.vin && <><dt className="text-muted-foreground">Şasi</dt><dd>{v.vin}</dd></>}
        {v.engineNo && <><dt className="text-muted-foreground">Motor</dt><dd>{v.engineNo}</dd></>}
        {v.description && <><dt className="text-muted-foreground">Açıklama</dt><dd>{v.description}</dd></>}
        <dt className="text-muted-foreground">Müşteri</dt><dd>{c ? <Link to="/musteriler/$id" params={{ id: c.id }} className="font-semibold text-primary underline">{customerName(c)}</Link> : "—"}</dd>
        <dt className="text-muted-foreground">Telefon</dt><dd className="font-semibold">{c?.phone}</dd>
      </dl>
      <div>
        <h2 className="mb-2 text-xl font-bold">Bakiye (bu araç)</h2>
        <BalanceTable rows={data.b} />
      </div>
      <div>
        <h2 className="mb-2 text-xl font-bold">Servis geçmişi</h2>
        {data.w.length === 0 ? <p className="text-muted-foreground">Henüz servis kaydı yok.</p> : <ul className="grid gap-2">{data.w.map(({ w, b }) => (
          <li key={w.id} className="flex flex-wrap items-center gap-2">
            <button type="button" className="font-semibold text-primary underline" onClick={() => openServiceForm(w.id)}>{w.orderNo}</button>
            <span>{formatDate(w.enteredAt)}{w.description ? ` — ${w.description}` : ""}</span>
            {b && <><PaymentBadge state={b.state} />{b.remaining > 0 && <span className="font-semibold text-destructive tabular-nums">Kalan: {formatMoney({ amount: b.remaining, currency: b.currency })}</span>}</>}
          </li>
        ))}</ul>}
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">Bakım hatırlatıcıları</h2>
          <Button variant="outline" onClick={() => setRemOpen(true)}>+ Bakım hatırlatıcı ekle</Button>
        </div>
        {reminders.length === 0 ? <p className="text-muted-foreground">Bu araç için hatırlatıcı yok. Örn. yağ bakımını bugün yaptıysanız 1 yıl sonrası için ekleyin.</p> : <ul className="grid gap-2">{reminders.map((m) => <ReminderRow key={m.id} m={m} />)}</ul>}
      </div>
      <ReminderForm open={remOpen} onOpenChange={setRemOpen} vehicleId={id} />
      <VehicleForm open={edit} onOpenChange={setEdit} vehicle={v} />
    </section>
  );
}
