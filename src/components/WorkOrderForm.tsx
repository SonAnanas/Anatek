import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DeleteButton } from "@/components/DeleteButton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, inputCls, selectCls } from "@/components/Field";
import { CustomerForm } from "@/components/CustomerForm";
import { VehicleForm } from "@/components/VehicleForm";
import { OrderPayments } from "@/components/Payments";
import { useRepo } from "@/hooks/use-repo";
import { auditOf, customerName, isOrderCompleted, itemsOfOrder, listStatuses, repo, saveWorkOrder, vehiclesOfCustomer, type ItemInput } from "@/lib/repository";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { displayPlate } from "@/lib/format";
import type { Currency, WorkOrder } from "@/lib/types";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; orderId?: string | null };

export function WorkOrderForm({ open, onOpenChange, orderId }: Props) {
  const order = orderId ? repo.workOrders.get(orderId) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{order ? `Servis ${order.orderNo}` : "Yeni servis"}</DialogTitle>
          <DialogDescription>Ctrl+S kaydet · Esc kapat</DialogDescription>
        </DialogHeader>
        {open && <Inner key={orderId ?? "new"} order={order} onDone={() => onOpenChange(false)} />}
        {open && order && <OrderPayments orderId={order.id} />}
      </DialogContent>
    </Dialog>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const toInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");
/** "1.250,50" / "1250.5" -> kuruş */
export function parseAmount(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return 0;
  // Virgül varsa ondalıktır, noktalar binlik. Virgül yoksa "1.200" / "12.500.000" binlik; "1250.5" ondalık.
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
const fmtAmount = (k: number) => (k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = { key: string; id?: string; name: string; kind: "part" | "labor"; description: string; amount: string };

function Inner({ order, onDone }: { order?: WorkOrder | undefined; onDone: () => void }) {
  const { data: lists } = useRepo(() => ({
    customers: repo.customers.list().sort((a, b) => customerName(a).localeCompare(customerName(b), "tr")),
    vehicles: repo.vehicles.list(),
    employees: repo.employees.list(),
    statuses: listStatuses(),
  }), { customers: [], vehicles: [], employees: [], statuses: [] });
  const completed = order ? isOrderCompleted(order) : false;
  const [f, setF] = useState({
    customerId: order?.customerId ?? "", vehicleId: order?.vehicleId ?? "",
    enteredAt: toInput(order?.enteredAt) || today(), expectedAt: toInput(order?.expectedAt),
    employeeId: order?.employeeId ?? "", description: order?.description ?? "",
    currency: (order?.currency ?? "TRY") as Currency, statusId: order?.statusId ?? "",
  });
  const [rows, setRows] = useState<Row[]>(() => {
    const ex = order ? itemsOfOrder(order.id) : [];
    return ex.length
      ? ex.map((i) => ({ key: i.id, id: i.id, name: i.name, kind: i.kind, description: i.description ?? "", amount: fmtAmount(i.amount.amount) }))
      : [{ key: crypto.randomUUID(), name: "", kind: "labor", description: "", amount: "" }];
  });
  const [error, setError] = useState("");
  const [newCustomer, setNewCustomer] = useState(false);
  const [newVehicle, setNewVehicle] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const statusId = f.statusId || lists.statuses[0]?.id || "";

  const vehicleOptions = f.customerId ? lists.vehicles.filter((v) => v.customerId === f.customerId) : lists.vehicles;
  const total = useMemo(() => rows.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0), [rows]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.customerId || !f.vehicleId) return setError("Müşteri ve araç seçin.");
    if (!f.enteredAt) return setError("Giriş tarihi zorunlu.");
    if (f.expectedAt && f.expectedAt < f.enteredAt) return setError("Tahmini teslim, girişten önce olamaz.");
    const filled = rows.filter((r) => r.name.trim() || r.amount.trim());
    const items: ItemInput[] = [];
    for (const r of filled) {
      const amount = parseAmount(r.amount);
      if (!r.name.trim()) return setError("Her kalemin adı olmalı.");
      if (amount === null) return setError(`"${r.name}" için tutar geçersiz.`);
      items.push({ id: r.id, name: r.name.trim(), kind: r.kind, description: r.description.trim() || undefined, amount });
    }
    try {
      saveWorkOrder({
        customerId: f.customerId, vehicleId: f.vehicleId, statusId,
        enteredAt: new Date(f.enteredAt).toISOString(), expectedAt: f.expectedAt ? new Date(f.expectedAt).toISOString() : undefined,
        employeeId: f.employeeId || undefined, description: f.description.trim() || undefined, currency: f.currency,
      }, items, order?.id);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Kaydedilemedi."); }
  };

  // Ctrl+S: odak nerede olursa olsun formu kaydet (iç içe yeni müşteri/araç formu açıkken değil).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const nestedOpen = newCustomer || newVehicle;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!nestedOpen) submitRef.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nestedOpen]);

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Müşteri *" htmlFor="w-cu">
          <div className="flex gap-2">
            <select id="w-cu" className={selectCls} value={f.customerId} autoFocus={!order}
              onChange={(e) => { const id = e.target.value; setF((p) => ({ ...p, customerId: id, vehicleId: vehiclesOfCustomer(id).length === 1 ? vehiclesOfCustomer(id)[0]!.id : "" })); }}>
              <option value="">Müşteri seçin…</option>
              {lists.customers.map((c) => <option key={c.id} value={c.id}>{customerName(c)} — {c.phone}</option>)}
            </select>
            <Button type="button" variant="outline" className="h-11" onClick={() => setNewCustomer(true)}>Yeni</Button>
          </div>
        </Field>
        <Field label="Araç *" htmlFor="w-ve">
          <div className="flex gap-2">
            <select id="w-ve" className={selectCls} value={f.vehicleId}
              onChange={(e) => { const v = lists.vehicles.find((x) => x.id === e.target.value); setF((p) => ({ ...p, vehicleId: e.target.value, customerId: v?.customerId ?? p.customerId })); }}>
              <option value="">Araç seçin…</option>
              {vehicleOptions.map((v) => <option key={v.id} value={v.id}>{displayPlate(v.plate)} — {v.brand} {v.model}</option>)}
            </select>
            <Button type="button" variant="outline" className="h-11" onClick={() => setNewVehicle(true)}>Yeni</Button>
          </div>
        </Field>
        <Field label="Giriş tarihi *" htmlFor="w-in"><Input id="w-in" type="date" className={inputCls} value={f.enteredAt} onChange={set("enteredAt")} /></Field>
        <Field label="Tahmini teslim" htmlFor="w-ex"><Input id="w-ex" type="date" className={inputCls} value={f.expectedAt} onChange={set("expectedAt")} /></Field>
        <Field label="Sorumlu çalışan" htmlFor="w-em">
          <select id="w-em" className={selectCls} value={f.employeeId} onChange={set("employeeId")}>
            <option value="">Seçilmedi</option>
            {lists.employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.role ? ` (${e.role})` : ""}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Durum" htmlFor="w-st">
            <select id="w-st" className={selectCls} value={statusId} onChange={set("statusId")}>
              {lists.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Para birimi" htmlFor="w-cur">
            <select id="w-cur" className={selectCls} value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <Field label="Açıklama / şikayet" htmlFor="w-de"><Textarea id="w-de" className="text-base" value={f.description} onChange={set("description")} /></Field>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Kalemler</h3>
          <Button type="button" variant="outline" onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), name: "", kind: "part", description: "", amount: "" }])}>
            <Plus className="h-4 w-4" /> Kalem ekle
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_8rem_1fr_9rem_2.75rem] gap-2 text-sm font-semibold text-muted-foreground">
          <span>Ad</span><span>Tür</span><span>Açıklama</span><span className="amount">Tutar</span><span />
        </div>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_8rem_1fr_9rem_2.75rem] gap-2">
            <Input aria-label="Kalem adı" className={inputCls} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
            <select aria-label="Tür" className={selectCls} value={r.kind} onChange={(e) => setRow(r.key, { kind: e.target.value as Row["kind"] })}>
              <option value="labor">İşçilik</option><option value="part">Parça</option>
            </select>
            <Input aria-label="Kalem açıklaması" className={inputCls} value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} />
            <Input aria-label="Tutar" inputMode="decimal" className={`${inputCls} text-right tabular-nums`} placeholder="0,00" value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Kalemi kaldır"
              disabled={completed && !!r.id} title={completed && r.id ? "Tamamlanmış servisin kalemi silinemez" : undefined}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex justify-end gap-4 border-t-2 pt-3 text-xl">
          <span>Toplam</span><b className="tabular-nums">{formatMoney({ amount: total, currency: f.currency })}</b>
        </div>
      </div>

      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <DialogFooter>
        {order && <span className="sm:mr-auto"><DeleteButton kind="workOrder" id={order.id} label={order.orderNo} onDeleted={onDone} /></span>}
        <Button type="button" variant="outline" onClick={onDone}>Vazgeç</Button>
        <Button type="submit">Kaydet</Button>
      </DialogFooter>
      {order && <History id={order.id} />}

      <CustomerForm open={newCustomer} onOpenChange={setNewCustomer} onSaved={(c) => setF((p) => ({ ...p, customerId: c.id, vehicleId: "" }))} />
      <VehicleForm open={newVehicle} onOpenChange={setNewVehicle} customerId={f.customerId || undefined}
        onSaved={(v) => setF((p) => ({ ...p, vehicleId: v.id, customerId: v.customerId }))} />
    </form>
  );
}

const ACTION: Record<string, string> = { create: "Oluşturuldu", update: "Değiştirildi", archive: "Arşivlendi", restore: "Geri alındı", delete: "Silindi" };
function History({ id }: { id: string }) {
  const { data } = useRepo(() => auditOf(id), [], [id]);
  if (!data.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Değişiklik geçmişi ({data.length})</summary>
      <ul className="mt-2 grid gap-1">
        {data.map((a) => <li key={a.id}><span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString("tr-TR")}</span> — {ACTION[a.action]}{a.details ? `: ${a.details}` : ""}</li>)}
      </ul>
    </details>
  );
}
