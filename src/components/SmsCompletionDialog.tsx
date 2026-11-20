import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ensureDefaultTemplate, fillTemplate, getSmsSettings, onOrderCompleted, repo, varsForOrder } from "@/lib/repository";
import { recoverStuckSms, sendOrderSms } from "@/lib/sms-send";
import { SmsCounter } from "@/components/SmsCounter";
import { toast } from "sonner";

/** Servis "Tamamlandı" olunca (ödemeden bağımsız) otomatik SMS açıksa önizleme gösterir. */
export function SmsCompletionDialog() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => { recoverStuckSms(); }, []);
  useEffect(() => onOrderCompleted((id) => {
    if (!getSmsSettings().autoSms) return;
    const w = repo.workOrders.get(id);
    setPhone(w ? repo.customers.get(w.customerId)?.phone ?? "" : "");
    setText(fillTemplate(ensureDefaultTemplate().body, varsForOrder(id)));
    setOrderId(id);
  }), []);
  const send = async () => {
    if (!orderId) return;
    const id = orderId;
    setOrderId(null);
    let log;
    try { log = await sendOrderSms(id, text); } catch (e) { toast.error(`SMS gönderilemedi: ${e instanceof Error ? e.message : "bilinmeyen hata"}`); return; }
    if (log.status === "sent") toast.success(getSmsSettings().smsMode === "iletimerkezi" ? "SMS gönderildi." : "SMS gönderildi (simülasyon)."); else toast.error(`SMS gönderilemedi: ${log.error ?? ""}`);
  };
  return (
    <Dialog open={!!orderId} onOpenChange={(o) => { if (!o) setOrderId(null); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Servis tamamlandı — SMS gönderilsin mi?</DialogTitle>
          <DialogDescription>Alıcı: {phone || "Telefon kayıtlı değil (gönderim hata olarak kaydedilir)"}</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Mesaj" rows={5} className="text-base" value={text} onChange={(e) => setText(e.target.value)} />
        <SmsCounter text={text} />
        <DialogFooter className="gap-2">
          <Button variant="outline" size="lg" onClick={() => setOrderId(null)}>Gönderme</Button>
          <Button size="lg" onClick={send} disabled={!text.trim()}>Gönder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
