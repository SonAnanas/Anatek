// İleti Merkezi gönderim katmanı. Belge: POST https://api.iletimerkezi.com/v1/send-sms/json
// Tarayıcılar bu adrese doğrudan istek atamaz (CORS); bu yüzden istek Android'de yerel (native) HTTP ile,
// Windows'ta ana süreç (Electron) üzerinden gider.
import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const IM_URL = "https://api.iletimerkezi.com/v1/send-sms/json";

declare global {
  interface Window { masaustu?: { httpPost(url: string, body: string): Promise<{ status: number; text: string }> } }
}

export type ImConfig = { key: string; hash: string; sender: string };
export type SendResult = { ok: true } | { ok: false; error: string };

/** "0532 111 22 33" / "+90 532 ..." -> "905321112233". Cep numarası değilse null. */
export function toMsisdn(phone: string): string | null {
  const d = phone.replace(/\D/g, "").slice(-10);
  return /^5\d{9}$/.test(d) ? "90" + d : null;
}

export function buildBody(cfg: ImConfig, to: string, text: string) {
  // Belgedeki alan adı "receipents" (yazım böyle). iys "0": ticari olmayan bilgilendirme mesajı.
  return { request: { authentication: { key: cfg.key, hash: cfg.hash }, order: { sender: cfg.sender, iys: "0", message: { text, receipents: { number: [to] } } } } };
}

const HINTS: Record<number, string> = {
  401: "Anahtar/hash hatalı ya da panelde \"API erişimine izin ver\" kapalı.",
  451: "Aynı mesaj kısa süre önce gönderilmiş (tekrar koruması). Biraz bekleyip tekrar deneyin.",
  452: "Alıcı numarası geçersiz.",
};

export function parseImResponse(httpStatus: number, text: string): SendResult {
  let json: { response?: { status?: { code?: number; message?: string } } } | undefined;
  try { json = JSON.parse(text); } catch { /* düz metin */ }
  const code = json?.response?.status?.code ?? httpStatus;
  const message = json?.response?.status?.message;
  if (code === 200) return { ok: true };
  const hint = HINTS[code];
  return { ok: false, error: `Hata ${code}${message ? ` — ${message}` : ""}${hint ? `. ${hint}` : ""}` };
}

async function postJson(url: string, payload: unknown): Promise<{ status: number; text: string }> {
  if (typeof window !== "undefined" && window.masaustu) return window.masaustu.httpPost(url, JSON.stringify(payload));
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.post({ url, headers: { "Content-Type": "application/json" }, data: payload });
    return { status: r.status, text: typeof r.data === "string" ? r.data : JSON.stringify(r.data) };
  }
  throw new Error("Bu ortamda (tarayıcı) gerçek SMS gönderilemez. Android veya Windows uygulamasını kullanın.");
}

export async function sendViaIletiMerkezi(cfg: ImConfig, phone: string, text: string): Promise<SendResult> {
  if (!cfg.key || !cfg.hash || !cfg.sender) return { ok: false, error: "İleti Merkezi bilgileri eksik (Ayarlar > SMS)." };
  if (!/^[\x20-\x7E]{1,11}$/.test(cfg.sender)) return { ok: false, error: "Gönderici başlığı en fazla 11 karakter olmalı ve Türkçe karakter içermemeli." };
  const to = toMsisdn(phone);
  if (!to) return { ok: false, error: "Telefon numarası geçersiz (cep numarası, örn. 0532 111 22 33)." };
  try {
    const r = await postJson(IM_URL, buildBody(cfg, to, text));
    return parseImResponse(r.status, r.text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bağlantı hatası (internet var mı?)" };
  }
}
