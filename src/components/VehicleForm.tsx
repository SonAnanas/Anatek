import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, inputCls, selectCls } from "@/components/Field";
import { customerName, findVehicleByPlate, repo } from "@/lib/repository";
import { normalizePlate } from "@/lib/normalize";
import { displayPlate } from "@/lib/format";
import type { Vehicle } from "@/lib/types";

export const VEHICLE_TYPES = ["Otomobil", "SUV", "Kamyonet", "Pikap", "Minibüs", "Kamyon", "Motosiklet", "Diğer"];

type Props = { open: boolean; onOpenChange: (o: boolean) => void; vehicle?: Vehicle; customerId?: string | undefined; onSaved?: (v: Vehicle) => void };

export function VehicleForm({ open, onOpenChange, vehicle, customerId, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="text-2xl">{vehicle ? "Aracı düzenle" : "Yeni araç"}</DialogTitle></DialogHeader>
        {open && <Inner vehicle={vehicle} customerId={customerId} onDone={(v) => { onSaved?.(v); onOpenChange(false); }} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Inner({ vehicle, customerId, onDone, onCancel }: { vehicle?: Vehicle | undefined; customerId?: string | undefined; onDone: (v: Vehicle) => void; onCancel: () => void }) {
  const customers = repo.customers.list().sort((a, b) => customerName(a).localeCompare(customerName(b), "tr"));
  const [f, setF] = useState({
    plate: vehicle ? displayPlate(vehicle.plate) : "", brand: vehicle?.brand ?? "", model: vehicle?.model ?? "",
    year: vehicle?.year ? String(vehicle.year) : "", type: vehicle?.type ?? "Otomobil", vin: vehicle?.vin ?? "",
    engineNo: vehicle?.engineNo ?? "", description: vehicle?.description ?? "", customerId: vehicle?.customerId ?? customerId ?? "",
  });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const plate = normalizePlate(f.plate);
  const existing = plate ? findVehicleByPlate(plate, vehicle?.id) : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate || !f.brand.trim() || !f.model.trim() || !f.customerId) { setError("Plaka, marka, model ve müşteri zorunlu."); return; }
    if (existing) { setError("Bu plaka başka bir araçta kayıtlı."); return; }
    const year = f.year ? Number(f.year) : undefined;
    if (year !== undefined && (!Number.isInteger(year) || year < 1950 || year > 2100)) { setError("Yıl geçersiz."); return; }
    const data = {
      plate, brand: f.brand.trim(), model: f.model.trim(), year, type: f.type, customerId: f.customerId,
      vin: f.vin.trim().toUpperCase() || undefined, engineNo: f.engineNo.trim().toUpperCase() || undefined, description: f.description.trim() || undefined,
    };
    onDone(vehicle ? repo.vehicles.update(vehicle.id, data) : repo.vehicles.create(data));
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Plaka *" htmlFor="v-pl" hint={plate && <span className="text-sm text-muted-foreground">Kaydedilecek: <b className="tabular-nums">{plate}</b></span>}>
        <Input id="v-pl" className="h-12 text-xl font-semibold uppercase tracking-wider" value={f.plate} onChange={set("plate")} autoFocus />
      </Field>
      {existing && <p role="alert" className="font-semibold text-destructive">Bu plaka zaten kayıtlı.</p>}
      <Field label="Müşteri *" htmlFor="v-cu">
        <select id="v-cu" className={selectCls} value={f.customerId} onChange={set("customerId")}>
          <option value="">Müşteri seçin…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{customerName(c)} — {c.phone}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Marka *" htmlFor="v-br"><Input id="v-br" className={inputCls} value={f.brand} onChange={set("brand")} /></Field>
        <Field label="Model *" htmlFor="v-mo"><Input id="v-mo" className={inputCls} value={f.model} onChange={set("model")} /></Field>
        <Field label="Yıl" htmlFor="v-yr"><Input id="v-yr" inputMode="numeric" className={inputCls} value={f.year} onChange={set("year")} /></Field>
        <Field label="Tip" htmlFor="v-ty">
          <select id="v-ty" className={selectCls} value={f.type} onChange={set("type")}>
            {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Şasi no" htmlFor="v-vin"><Input id="v-vin" className={inputCls} value={f.vin} onChange={set("vin")} /></Field>
        <Field label="Motor no" htmlFor="v-en"><Input id="v-en" className={inputCls} value={f.engineNo} onChange={set("engineNo")} /></Field>
      </div>
      <Field label="Açıklama" htmlFor="v-de"><Textarea id="v-de" className="text-base" value={f.description} onChange={set("description")} /></Field>
      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Vazgeç</Button>
        <Button type="submit">Kaydet</Button>
      </DialogFooter>
    </form>
  );
}
