// Ödeme TAKİBİ arayüzü: tahsilat uygulama dışında yapılır, burada yalnızca kayıt tutulur.
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, inputCls, selectCls } from "@/components/Field";
import { parseAmount } from "@/components/WorkOrderForm";
import { useRepo } from "@/hooks/use-repo";
import {
  customerName, markPayment, orderBalance, repo, PAYMENT_METHODS, PAYMENT_STATE_LABEL, type OrderPaymentState, paymentMethodLabel, paymentsOfOrder, recordPayment,
  type CurrencyBalance, type PaymentState,
} from "@/lib/repository";
import { displayPlate, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { Payment, PaymentMethod } from "@/lib/types";

/** İşlem durumundan AYRI, renkli ödeme etiketi. */
export function PaymentBadge({ state, className }: { state: OrderPaymentState; className?: string }) {
  return <Badge variant={state} className={`text-sm ${className ?? ""}`}>{PAYMENT_STATE_LABEL[state]}</Badge>;
}

/** Para birimi bazında ayrı toplam/ödenen/kalan tablosu (birimler birleştirilmez). */
export function BalanceTable({ rows }: { rows: CurrencyBalance[] }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Henüz tutar yok.</p>;
  return (
    <table className="text-base">
      <thead><tr className="border-b-2"><th className="py-2 pr-6 text-left">Birim</th><th className="amount pr-6">Toplam</th><th className="amount pr-6">Ödenen</th><th className="amount">Kalan borç</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.currency} className="border-b">
          <td className="py-2 pr-6">{r.currency}</td>
          <td className="amount pr-6">{formatMoney({ amount: r.total, currency: r.currency })}</td>
          <td className="amount pr-6">{formatMoney({ amount: r.paid, currency: r.currency })}</td>
          <td className={`amount ${r.unpaid > 0 ? "font-bold text-destructive" : ""}`}>{formatMoney({ amount: r.unpaid, currency: r.currency })}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

const STATUS_LABEL: Record<Payment["status"], string> = { active: "Geçerli", cancelled: "İptal edildi", refunded: "İade edildi" };

/** Servis detayındaki ödeme bölümü: özet, ödeme listesi, "Ödeme kaydı ekle". */
export function OrderPayments({ orderId }: { orderId: string }) {
  const { data } = useRepo(() => ({ b: orderBalance(orderId), list: paymentsOfOrder(orderId) }), { b: undefined, list: [] }, [orderId]);
  const [add, setAdd] = useState(false);
  const { b, list } = data;
  if (!b) return null;
  const m = (amount: number) => formatMoney({ amount, currency: b.currency });
  return (
    <section className="grid gap-3 border-t-2 pt-4" aria-label="Ödemeler">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold">Ödemeler</h3>
        <PaymentBadge state={b.state} />
        <Button type="button" className="ml-auto" onClick={() => setAdd(true)} disabled={b.cancelled || b.remaining <= 0}
          title={b.cancelled ? "İptal edilmiş servise ödeme girilemez" : b.remaining <= 0 ? "Kalan borç yok" : undefined}>Ödeme kaydı ekle</Button>
      </div>
      {b.cancelled && (
        <p role="status" className="rounded-md border-2 border-warning p-3 text-base">
          Bu servis iptal edildi; ciro ve borç hesabına girmez.
          {b.paid > 0 && <> <b>Ancak bu serviste {m(b.paid)} tahsilat kaydı var.</b> Parayı müşteriye iade ettiyseniz aşağıdan ilgili ödemeyi “İade” olarak işaretleyin.</>}
        </p>
      )}
      <p className="text-sm text-muted-foreground">Tahsilat uygulama dışında yapılır; burada yalnızca alınan ödemenin kaydı tutulur.</p>
      <dl className="grid grid-cols-1 gap-3 text-base sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Toplam</dt><dd className="amount text-left text-lg font-semibold">{m(b.total)}</dd></div>
        <div><dt className="text-muted-foreground">Ödenen</dt><dd className="amount text-left text-lg font-semibold">{m(b.paid)}</dd></div>
        <div><dt className="text-muted-foreground">Kalan borç</dt><dd className={`amount text-left text-lg font-bold ${b.remaining > 0 ? "text-destructive" : ""}`}>{m(b.remaining)}</dd></div>
      </dl>
      {list.length === 0 ? <p className="text-muted-foreground">Henüz ödeme kaydı yok.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-base">
          <thead><tr className="border-b-2 text-left"><th className="py-2">Tarih</th><th>Yöntem</th><th>Not</th><th>Durum</th><th className="amount">Tutar</th><th /></tr></thead>
          <tbody>{list.map((p) => {
            const active = (p.status ?? "active") === "active";
            return (
              <tr key={p.id} className={`border-b ${active ? "" : "text-muted-foreground"}`}>
                <td className="py-2">{formatDate(p.paidAt)}</td>
                <td>{paymentMethodLabel(p.method)}</td>
                <td>{p.note ?? "—"}</td>
                <td>{STATUS_LABEL[p.status ?? "active"]}</td>
                <td className={`amount font-semibold ${active ? "" : "line-through"}`}>{formatMoney(p.money)}</td>
                <td className="pl-2 text-right">{active && <MarkButtons payment={p} />}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <AddPaymentDialog open={add} onOpenChange={setAdd} orderId={orderId} />
    </section>
  );
}

function MarkButtons({ payment }: { payment: Payment }) {
  const [error, setError] = useState("");
  const act = (s: "cancelled" | "refunded") => { try { markPayment(payment.id, s); } catch (e) { setError(e instanceof Error ? e.message : "İşlem yapılamadı."); } };
  return (
    <div className="flex justify-end gap-2">
      {([["cancelled", "İptal", "Ödeme iptal edilsin mi?", "Yanlış girilmiş kayıtlar içindir."], ["refunded", "İade", "Ödeme iade edildi olarak işaretlensin mi?", "Para müşteriye geri verildiyse kullanın."]] as const).map(([s, label, title, desc]) => (
        <AlertDialog key={s}>
          <AlertDialogTrigger asChild><Button type="button" variant="outline" size="sm" className="h-9 text-sm">{label}</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                {formatMoney(payment.money)} · {formatDate(payment.paidAt)}. {desc} Kayıt silinmez, borca artık sayılmaz ve bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={() => act(s)}>{label} olarak işaretle</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
      {error && <span role="alert" className="text-sm font-semibold text-destructive">{error}</span>}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function AddPaymentDialog({ open, onOpenChange, orderId }: { open: boolean; onOpenChange: (o: boolean) => void; orderId: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg"
        // Ctrl+S burada ödeme formunu kaydeder; servis formuna ulaşmasın.
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); (e.currentTarget.querySelector("form") as HTMLFormElement | null)?.requestSubmit(); } }}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Ödeme kaydı ekle</DialogTitle>
          <DialogDescription className="text-base">Uygulama dışında alınmış ödemeyi kaydedin.</DialogDescription>
        </DialogHeader>
        {open && <AddPaymentInner orderId={orderId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddPaymentInner({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const b = orderBalance(orderId);
  const [f, setF] = useState({ paidAt: today(), amount: "", method: "cash" as PaymentMethod, note: "" });
  const [error, setError] = useState("");
  if (!b) return null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); e.stopPropagation();
    const amount = parseAmount(f.amount);
    if (amount === null || amount <= 0) return setError("Geçerli bir tutar girin.");
    if (!f.paidAt) return setError("Ödeme tarihi zorunlu.");
    try {
      recordPayment({ workOrderId: orderId, money: { amount, currency: b.currency }, method: f.method, paidAt: new Date(f.paidAt).toISOString(), note: f.note });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Kaydedilemedi."); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-base">Kalan borç: <b className="tabular-nums">{formatMoney({ amount: b.remaining, currency: b.currency })}</b></p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih *" htmlFor="p-date"><Input id="p-date" type="date" className={inputCls} value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
        <Field label={`Tutar (${b.currency}) *`} htmlFor="p-amount" hint={<span className="text-sm text-muted-foreground">Para birimi servisle aynıdır.</span>}>
          <Input id="p-amount" autoFocus inputMode="decimal" placeholder="0,00" className={`${inputCls} text-right tabular-nums`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="Yöntem" htmlFor="p-method">
          <select id="p-method" className={selectCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Not" htmlFor="p-note"><Textarea id="p-note" className="text-base" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Vazgeç</Button>
        <Button type="submit">Kaydet</Button>
      </DialogFooter>
    </form>
  );
}

/** Genel bakıştan hızlı ödeme kaydı: önce borcu kalan servis seçilir. */
export function QuickPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: orders } = useRepo(() => repo.workOrders.list()
    .map((w) => ({ w, b: orderBalance(w.id), c: repo.customers.get(w.customerId), v: repo.vehicles.get(w.vehicleId) }))
    .filter((x) => x.b && x.b.remaining > 0)
    .sort((a, b) => b.w.enteredAt.localeCompare(a.w.enteredAt)), [], [open]);
  const [orderId, setOrderId] = useState("");
  const change = (o: boolean) => { if (!o) setOrderId(""); onOpenChange(o); };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-w-lg"
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); (e.currentTarget.querySelector("form") as HTMLFormElement | null)?.requestSubmit(); } }}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Ödeme kaydet</DialogTitle>
          <DialogDescription className="text-base">Uygulama dışında alınmış ödemeyi ilgili servise kaydedin.</DialogDescription>
        </DialogHeader>
        {open && (orders.length === 0 ? <p className="text-base">Borcu kalan servis yok.</p> : (
          <div className="grid gap-4">
            <Field label="Servis *" htmlFor="q-order">
              <select id="q-order" className={selectCls} value={orderId} autoFocus onChange={(e) => setOrderId(e.target.value)}>
                <option value="">Servis seçin…</option>
                {orders.map(({ w, b, c, v }) => (
                  <option key={w.id} value={w.id}>{w.orderNo} — {v ? displayPlate(v.plate) : ""} — {c ? customerName(c) : ""} — kalan {formatMoney({ amount: b!.remaining, currency: b!.currency })}</option>
                ))}
              </select>
            </Field>
            {orderId && <AddPaymentInner key={orderId} orderId={orderId} onDone={() => change(false)} />}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
