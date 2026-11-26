import { useState } from "react";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputCls, selectCls } from "@/components/Field";
import { createReminder, customerName, REMINDER_KINDS, REMINDER_STATE_LABEL, remindersOfVehicle, renewReminder, reminderStatus, repo, toDayString, type ReminderState, type UpcomingReminder } from "@/lib/repository";
import { displayPlate, formatDate } from "@/lib/format";
import type { MaintenanceReminder } from "@/lib/types";

/** Önerilen aralıklar (ay). Kullanıcı değiştirebilir. */
const SUGGESTED: Record<string, number> = { "Yağ bakımı": 12, "Filtre değişimi": 12, "Fren bakımı": 12, "Lastik": 24, "Periyodik bakım": 12, "Muayene": 24, "Sigorta / kasko": 12 };
const STATE_VARIANT: Record<ReminderState, "unpaid" | "partial" | "paid"> = { overdue: "unpaid", soon: "partial", ok: "paid" };
const dueText = (daysLeft: number) => (daysLeft < 0 ? `${-daysLeft} gün gecikti` : daysLeft === 0 ? "bugün" : `${daysLeft} gün kaldı`);

type Props = { open: boolean; onOpenChange: (o: boolean) => void; vehicleId: string };

export function ReminderForm({ open, onOpenChange, vehicleId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="text-2xl">Bakım hatırlatıcı ekle</DialogTitle></DialogHeader>
        {open && <Inner vehicleId={vehicleId} onDone={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Inner({ vehicleId, onDone, onCancel }: { vehicleId: string; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState("Yağ bakımı"), [custom, setCustom] = useState("");
  const [last, setLast] = useState(toDayString(new Date()));
  const [amount, setAmount] = useState("1"), [unit, setUnit] = useState<"ay" | "yıl">("yıl");
  const [before, setBefore] = useState("7"), [note, setNote] = useState(""), [error, setError] = useState("");
  const months = Number(amount) * (unit === "yıl" ? 12 : 1);

  const pickKind = (k: string) => {
    setKind(k);
    const m = SUGGESTED[k];
    if (m) { if (m % 12 === 0) { setAmount(String(m / 12)); setUnit("yıl"); } else { setAmount(String(m)); setUnit("ay"); } }
  };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(last) && Number.isInteger(months) && months >= 1;
  const next = valid ? reminderStatus({ lastDoneAt: last, intervalMonths: months, remindDaysBefore: Number(before) || 0 }).dueAt : null;

  const guard = useSubmitGuard();
  const submit = (e: React.FormEvent) => { e?.preventDefault(); guard(() => submitInner(e)); };
  const submitInner = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      createReminder({ vehicleId, kind: kind === "Diğer" ? custom : kind, lastDoneAt: last, intervalMonths: months, remindDaysBefore: Number(before), note });
      toast.success("Bakım hatırlatıcı eklendi.");
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Kaydedilemedi."); }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Bakım türü" htmlFor="r-kind">
        <select id="r-kind" className={selectCls} value={kind} onChange={(e) => pickKind(e.target.value)}>
          {REMINDER_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </Field>
      {kind === "Diğer" && <Field label="Bakımın adı" htmlFor="r-custom"><Input id="r-custom" className={inputCls} value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
      <Field label="Son yapıldığı tarih" htmlFor="r-last"><Input id="r-last" type="date" className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Kaç sonra tekrar?" htmlFor="r-amount">
          <div className="flex gap-2">
            <Input id="r-amount" inputMode="numeric" className={`${inputCls} w-24`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select aria-label="Birim" className={selectCls} value={unit} onChange={(e) => setUnit(e.target.value as "ay" | "yıl")}><option value="ay">ay</option><option value="yıl">yıl</option></select>
          </div>
        </Field>
        <Field label="Kaç gün önce panelde göster?" htmlFor="r-before"><Input id="r-before" inputMode="numeric" className={inputCls} value={before} onChange={(e) => setBefore(e.target.value)} /></Field>
      </div>
      {next && <p className="text-base">Sonraki bakım: <b>{formatDate(next.toISOString())}</b></p>}
      <Field label="Not (isteğe bağlı)" htmlFor="r-note"><Input id="r-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Vazgeç</Button><Button type="submit">Kaydet</Button></DialogFooter>
    </form>
  );
}

function renew(id: string) {
  if (!window.confirm("Bakım bugün yapıldı olarak işaretlensin mi? Bir sonraki tarih bugünden itibaren hesaplanır.")) return;
  try { renewReminder(id); toast.success("Bakım yenilendi."); } catch (e) { toast.error(e instanceof Error ? e.message : "Yenilenemedi"); }
}

/** Araç detayındaki tek satır. */
export function ReminderRow({ m }: { m: MaintenanceReminder }) {
  const s = reminderStatus(m);
  return (
    <li className="flex flex-wrap items-center gap-3">
      <b>{m.kind}</b>
      <span className="text-muted-foreground">Son: {formatDate(m.lastDoneAt)} · Sonraki: {formatDate(s.dueAt.toISOString())}</span>
      <Badge variant={STATE_VARIANT[s.state]} className="text-sm">{REMINDER_STATE_LABEL[s.state]} ({dueText(s.daysLeft)})</Badge>
      {m.note && <span className="text-muted-foreground">— {m.note}</span>}
      <Button type="button" variant="outline" onClick={() => renew(m.id)}>Bakım yapıldı</Button>
      <Button type="button" variant="outline" className="text-destructive" onClick={() => { if (window.confirm(`“${m.kind}” hatırlatıcısı silinsin mi?`)) repo.maintenanceReminders.remove(m.id); }}>Sil</Button>
    </li>
  );
}

/** Genel bakıştaki "Yaklaşan bakımlar" listesi. */
export function UpcomingList({ items }: { items: UpcomingReminder[] }) {
  if (items.length === 0) return <p className="text-muted-foreground">Yaklaşan veya geçmiş bakım yok.</p>;
  return (
    <ul className="grid gap-2">
      {items.map(({ m, vehicle, customer, state, dueAt, daysLeft }) => (
        <li key={m.id} className="flex flex-wrap items-center gap-3">
          <Link to="/araclar/$id" params={{ id: vehicle.id }} className="font-bold tracking-wider text-primary underline">{displayPlate(vehicle.plate)}</Link>
          <Link to="/musteriler/$id" params={{ id: customer.id }} className="underline">{customerName(customer)}</Link>
          <span className="tabular-nums">{customer.phone}</span>
          <b>{m.kind}</b>
          <span className="text-muted-foreground">{formatDate(dueAt.toISOString())}</span>
          <Badge variant={STATE_VARIANT[state]} className="text-sm">{dueText(daysLeft)}</Badge>
          <Button type="button" variant="outline" onClick={() => renew(m.id)}>Bakım yapıldı</Button>
        </li>
      ))}
    </ul>
  );
}
export { remindersOfVehicle };
