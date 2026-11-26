// İleti Merkezi gönderim katmanı. Belge: POST https://api.iletimerkezi.com/v1/send-sms/json
// Tarayıcılar bu adrese doğrudan istek atamaz (CORS); bu yüzden istek Android'de yerel (native) HTTP ile,
// Windows'ta ana süreç (Electron) üzerinden gider.
import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const IM_BASE = "https://api.iletimerkezi.com/v1";
export const IM_URL = `${IM_BASE}/send-sms/json`;

declare global {
  interface Window { masaustu?: { httpPost(url: string, body: string): Promise<{ status: number; text: string }>; quit?(): Promise<void>;
    updateStart?(repo: string): Promise<{ ok: boolean; message?: string; cancelled?: boolean; sha256?: string }>;
    updateCancel?(): Promise<void>;
    onUpdateProgress?(cb: (p: { received: number; total: number }) => void): () => void;
  } }
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
  450: "Gönderici başlığı kullanıma uygun değil. Onaylı başlığınızı yazın (APITEST yalnızca henüz onaylı başlığınız yokken çalışır).",
  451: "Aynı mesaj aynı numaraya az önce zaten kabul edilmiş olabilir (tekrar koruması). Tekrar göndermeden önce firma panelinde Raporlar'a bakın; yoksa müşteriye çift mesaj gider.",
  452: "Alıcı numarası boş veya hatalı.",
  466: "Numara geçerli bir cep numarası değil (örn. 0532 111 22 33).",
  402: "Bakiye yetersiz. Firma panelinden kontör yükleyin.",
  454: "Mesaj metni boş.",
  459: "Gönderici başlığı boş olamaz.",
  460: "Gönderici başlığı en fazla 11 karakter olmalı ve Türkçe karakter içermemeli.",
  453: "Mesaj çok uzun (en fazla 7 SMS parçası, yaklaşık 1000 karakter).",
  503: "Firmanın sunucusu geçici olarak hizmet vermiyor. Biraz sonra Yeniden gönder'i deneyin.",
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

// ---- Bağlantı kontrolü: get-balance + get-sender (kontör harcamaz, SMS göndermez) ----
export type ConnResult = { ok: true; balanceTry: number | null; smsEstimate: number | null; senders: string[] } | { ok: false; error: string };

export function extractBalance(text: string): { amount: number | null; sms: number | null } {
  try {
    const b = JSON.parse(text)?.response?.balance;
    const amount = b?.amount !== undefined ? Number(b.amount) : NaN, sms = b?.sms !== undefined ? Number(b.sms) : NaN;
    return { amount: Number.isFinite(amount) ? amount : null, sms: Number.isFinite(sms) ? sms : null };
  } catch { return { amount: null, sms: null }; }
}
export function extractSenders(text: string): string[] {
  try {
    const s = JSON.parse(text)?.response?.senders?.sender;
    if (Array.isArray(s)) return s.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    return typeof s === "string" && s.trim() ? [s] : [];
  } catch { return []; }
}

export async function checkImConnection(cfg: { key: string; hash: string }): Promise<ConnResult> {
  if (!cfg.key || !cfg.hash) return { ok: false, error: "API anahtarı ve hash girilmemiş." };
  const body = { request: { authentication: { key: cfg.key, hash: cfg.hash } } };
  try {
    const b = await postJson(`${IM_BASE}/get-balance/json`, body);
    const r = parseImResponse(b.status, b.text);
    if (!r.ok) return r;
    const { amount, sms } = extractBalance(b.text);
    let senders: string[] = [];
    try { const s = await postJson(`${IM_BASE}/get-sender/json`, body); if (parseImResponse(s.status, s.text).ok) senders = extractSenders(s.text); } catch { /* başlık listesi alınamadı: bakiye yine de geçerli */ }
    return { ok: true, balanceTry: amount, smsEstimate: sms, senders };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bağlantı hatası (internet var mı?)" };
  }
}
