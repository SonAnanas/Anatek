// Asıl gönderim: mod "simulate" ise eski simülasyon, "iletimerkezi" ise gerçek gönderim.
import { customerName, getSmsSettings, repo, retrySms, sendSmsForOrder } from "./repository";
import { sendViaIletiMerkezi, type SendResult } from "./sms-provider";
import type { SmsLog } from "./types";

const cfg = () => { const s = getSmsSettings(); return { key: s.imKey, hash: s.imHash, sender: s.imSender }; };

async function deliverReal(id: string): Promise<SmsLog> {
  const log = repo.smsLogs.get(id)!;
  const r = await sendViaIletiMerkezi(cfg(), log.phone, log.message);
  return repo.smsLogs.update(id, {
    status: r.ok ? "sent" : "failed", error: r.ok ? undefined : r.error,
    attempts: (log.attempts ?? 0) + 1, sentAt: r.ok ? new Date().toISOString() : log.sentAt,
  });
}

export async function sendOrderSms(workOrderId: string, message: string): Promise<SmsLog> {
  if (getSmsSettings().smsMode !== "iletimerkezi") return sendSmsForOrder(workOrderId, message);
  const w = repo.workOrders.get(workOrderId);
  if (!w) throw new Error("Kayıt bulunamadı");
  const c = repo.customers.get(w.customerId), v = repo.vehicles.get(w.vehicleId);
  const log = repo.smsLogs.create({ customerId: w.customerId, workOrderId, customerName: c ? customerName(c) : "", plate: v?.plate ?? "", phone: c?.phone?.trim() ?? "", message, status: "queued", attempts: 0 });
  return deliverReal(log.id);
}

export async function retryOrderSms(id: string): Promise<SmsLog> {
  if (getSmsSettings().smsMode !== "iletimerkezi") return retrySms(id);
  const log = repo.smsLogs.get(id);
  if (!log) throw new Error("Kayıt bulunamadı");
  if (log.status !== "failed") throw new Error("Yalnızca başarısız mesajlar yeniden gönderilir.");
  const phone = (log.customerId ? repo.customers.get(log.customerId)?.phone?.trim() : undefined) || log.phone;
  repo.smsLogs.update(id, { status: "queued", phone, error: undefined });
  return deliverReal(id);
}

/** Ayarlar'daki "Test SMS": kayıt oluşturmadan, girilen numaraya gönderir. */
export function sendTestSms(phone: string, text: string): Promise<SendResult> {
  return sendViaIletiMerkezi(cfg(), phone, text);
}

/** Gönderim sırasında uygulama kapandıysa "queued" kalan kayıtları başarısız işaretler (kullanıcı kontrol edip yeniden gönderir). */
export function recoverStuckSms(maxAgeMs = 120_000): number {
  let n = 0;
  for (const l of repo.smsLogs.list()) {
    if (l.status === "queued" && Date.now() - new Date(l.createdAt).getTime() >= maxAgeMs) {
      repo.smsLogs.update(l.id, { status: "failed", error: "Gönderim yarım kaldı, durumu belirsiz. Yeniden göndermeden önce firma panelinden kontrol edin." });
      n++;
    }
  }
  return n;
}
