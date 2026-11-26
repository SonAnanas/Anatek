import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputCls, selectCls } from "@/components/Field";
import { parseAmount } from "@/components/WorkOrderForm";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, recordExpense } from "@/lib/repository";
import { CURRENCIES } from "@/lib/money";
import { toDateInput } from "@/lib/periods";
import type { Currency, PaymentMethod } from "@/lib/types";

export function ExpenseForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Gider ekle</DialogTitle>
          <DialogDescription className="text-base">Gider kaydı silinmez; yanlışsa arşivlenir.</DialogDescription>
        </DialogHeader>
        {open && <Inner onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Inner({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ description: "", amount: "", currency: "TRY" as Currency, spentAt: toDateInput(new Date()), category: "Diğer", method: "cash" as PaymentMethod });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(f.amount);
    if (amount === null || amount <= 0) return setError("Geçerli bir tutar girin.");
    if (!f.spentAt) return setError("Tarih zorunlu.");
    try {
      recordExpense({ category: f.category, description: f.description, money: { amount, currency: f.currency }, method: f.method, spentAt: new Date(f.spentAt).toISOString() });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Kaydedilemedi."); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Açıklama" htmlFor="x-desc"><Input id="x-desc" autoFocus className={inputCls} value={f.description} onChange={set("description")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tutar *" htmlFor="x-amount"><Input id="x-amount" inputMode="decimal" placeholder="0,00" className={`${inputCls} text-right tabular-nums`} value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Para birimi" htmlFor="x-cur">
          <select id="x-cur" className={selectCls} value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Tarih *" htmlFor="x-date"><Input id="x-date" type="date" className={inputCls} value={f.spentAt} onChange={set("spentAt")} /></Field>
        <Field label="Kategori" htmlFor="x-cat">
          <select id="x-cat" className={selectCls} value={f.category} onChange={set("category")}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Ödeme yöntemi" htmlFor="x-method">
          <select id="x-method" className={selectCls} value={f.method} onChange={set("method")}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </Field>
      </div>
      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Vazgeç</Button>
        <Button type="submit">Kaydet</Button>
      </DialogFooter>
    </form>
  );
}
