import { useState } from "react";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { formatPhoneInput } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, inputCls } from "@/components/Field";
import { customerName, findDuplicatePhone, repo } from "@/lib/repository";
import type { Customer } from "@/lib/types";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer; onSaved?: (c: Customer) => void };

export function CustomerForm({ open, onOpenChange, customer, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="text-2xl">{customer ? "Müşteriyi düzenle" : "Yeni müşteri"}</DialogTitle></DialogHeader>
        {open && <Inner customer={customer} onDone={(c) => { onSaved?.(c); onOpenChange(false); }} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Inner({ customer, onDone, onCancel }: { customer?: Customer | undefined; onDone: (c: Customer) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    firstName: customer?.firstName ?? "", lastName: customer?.lastName ?? "", phone: customer?.phone ?? "",
    phone2: customer?.phone2 ?? "", address: customer?.address ?? "", note: customer?.note ?? "",
  });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setPhone = (k: "phone" | "phone2") => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: formatPhoneInput(e.target.value) }));
  const dups = findDuplicatePhone(f.phone, customer?.id);

  const guard = useSubmitGuard();
  const submit = (e: React.FormEvent) => { e?.preventDefault(); guard(() => submitInner(e)); };
  const submitInner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.firstName.trim() || !f.lastName.trim() || !f.phone.trim()) { setError("Ad, soyad ve telefon zorunlu."); return; }
    const data = {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim(),
      phone2: f.phone2.trim() || undefined, address: f.address.trim() || undefined, note: f.note.trim() || undefined,
    };
    onDone(customer ? repo.customers.update(customer.id, data) : repo.customers.create(data));
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ad *" htmlFor="c-fn"><Input id="c-fn" className={inputCls} value={f.firstName} onChange={set("firstName")} autoFocus /></Field>
        <Field label="Soyad *" htmlFor="c-ln"><Input id="c-ln" className={inputCls} value={f.lastName} onChange={set("lastName")} /></Field>
        <Field label="Telefon *" htmlFor="c-ph"><Input id="c-ph" type="tel" className={inputCls} value={f.phone} onChange={setPhone("phone")} /></Field>
        <Field label="2. telefon" htmlFor="c-ph2"><Input id="c-ph2" type="tel" className={inputCls} value={f.phone2} onChange={setPhone("phone2")} /></Field>
      </div>
      {dups.length > 0 && (
        <div role="alert" className="rounded-md border-2 border-warning bg-warning/15 p-3 text-base">
          Bu telefon numarası zaten kayıtlı:{" "}
          {dups.map((d, i) => (
            <span key={d.id}>{i > 0 && ", "}<Link to="/musteriler/$id" params={{ id: d.id }} className="font-semibold underline">{customerName(d)}</Link></span>
          ))}
          . Yine de kaydedebilirsiniz.
        </div>
      )}
      <Field label="Adres" htmlFor="c-ad"><Input id="c-ad" className={inputCls} value={f.address} onChange={set("address")} /></Field>
      <Field label="Not" htmlFor="c-no"><Textarea id="c-no" className="text-base" value={f.note} onChange={set("note")} /></Field>
      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Vazgeç</Button>
        <Button type="submit">Kaydet</Button>
      </DialogFooter>
    </form>
  );
}
