// Yedek oluşturma / doğrulama / geri yükleme. Veri yalnızca repository.ts üzerinden okunur/yazılır.
import { ALL_TABLES, backupMeta, logAudit, readAllTables, replaceAllTables, type AllData } from "./repository";
import type { EntityName } from "./types";

export const SCHEMA_VERSION = 1;
export const APP_VERSION = "1.0.0";
const FORMAT = "otoservis-backup";
const PBKDF2_ITERATIONS = 200_000;
/** Yedeğe konmayan gizli ayar anahtarları. */
const SECRET_SETTING_KEYS = ["apiKey", "imKey", "imHash"];

export type Counts = Record<EntityName, number>;
export interface BackupFile {
  format: typeof FORMAT; schemaVersion: number; appVersion: string; createdAt: string;
  counts: Counts; sha256: string; encrypted: boolean;
  kdf?: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string }; iv?: string;
  /** Şifresizse veri JSON metni, şifreliyse base64 şifreli metin. */
  payload: string;
}
export class BackupError extends Error {}

const enc = new TextEncoder(), dec = new TextDecoder();
const toB64 = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ""; u.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function sha256Hex(text: string) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export const countsOf = (d: AllData): Counts => Object.fromEntries(ALL_TABLES.map((t) => [t, (d[t] ?? []).length])) as Counts;
const stripSecrets = (d: AllData): AllData => ({ ...d, settings: d.settings.filter((s) => !SECRET_SETTING_KEYS.includes(s.key)) });

export function backupFileName(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `OtoServis_Backup_${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.backup`;
}

/** Mevcut verinin yedek dosyası metnini üretir (gizli alanlar hariç). */
export async function createBackup(password = "", data: AllData = readAllTables()): Promise<string> {
  const clean = stripSecrets(data);
  const plain = JSON.stringify(clean);
  const file: BackupFile = { format: FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, createdAt: new Date().toISOString(), counts: countsOf(clean), sha256: await sha256Hex(plain), encrypted: false, payload: plain };
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
    Object.assign(file, { encrypted: true, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toB64(salt) }, iv: toB64(iv), payload: toB64(ct) });
  }
  return JSON.stringify(file, null, 2);
}

/** b. Biçim ve JSON doğrulaması. */
export function parseBackupFile(text: string): BackupFile {
  let f: BackupFile;
  try { f = JSON.parse(text); } catch { throw new BackupError("Dosya okunamadı: geçerli bir yedek dosyası değil (JSON hatalı)."); }
  if (!f || f.format !== FORMAT || typeof f.payload !== "string" || typeof f.sha256 !== "string" || typeof f.schemaVersion !== "number")
    throw new BackupError("Bu dosya bir Anatek yedek dosyası değil.");
  if (f.encrypted && (!f.iv || !f.kdf?.salt)) throw new BackupError("Şifreli yedek dosyasının bilgileri eksik. Dosya bozuk.");
  return f;
}

/** Şifreliyse çözer, ardından c. SHA-256 doğrular. Veri JSON metnini döndürür. */
export async function decryptAndVerify(f: BackupFile, password = ""): Promise<string> {
  let plain = f.payload;
  if (f.encrypted) {
    if (!password) throw new BackupError("Bu yedek şifreli. Lütfen parolayı girin.");
    try {
      const key = await deriveKey(password, fromB64(f.kdf!.salt), f.kdf!.iterations);
      plain = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(f.iv!) as BufferSource }, key, fromB64(f.payload) as BufferSource));
    } catch { throw new BackupError("Parola yanlış veya dosya bozuk. Yedek açılamadı."); }
  }
  if ((await sha256Hex(plain)) !== f.sha256) throw new BackupError("Dosya bozuk: bütünlük kontrolü (SHA-256) tutmuyor. Hiçbir veri değiştirilmedi.");
  return plain;
}

/** d. Eski şemaları güncel şemaya taşır. Şimdilik yalnızca sürüm 1 var. */
export function migrate(data: unknown, _fromVersion: number): unknown { return data; }
export function checkSchema(f: BackupFile) {
  if (f.schemaVersion > SCHEMA_VERSION) throw new BackupError(`Bu yedek uygulamanın daha yeni bir sürümüyle alınmış (şema ${f.schemaVersion}). Önce uygulamayı güncelleyin.`);
  if (!Number.isInteger(f.schemaVersion) || f.schemaVersion < 1) throw new BackupError("Yedek şema sürümü geçersiz.");
}
export function toData(plain: string, f: BackupFile): AllData {
  let raw: unknown;
  try { raw = JSON.parse(plain); } catch { throw new BackupError("Yedek içeriği okunamadı. Dosya bozuk."); }
  const d = (f.schemaVersion < SCHEMA_VERSION ? migrate(raw, f.schemaVersion) : raw) as Record<string, unknown>;
  if (!d || typeof d !== "object") throw new BackupError("Yedek içeriği geçersiz.");
  const out = {} as Record<EntityName, unknown[]>;
  for (const t of ALL_TABLES) {
    const v = d[t] ?? [];
    if (!Array.isArray(v)) throw new BackupError(`Yedekteki "${t}" tablosu geçersiz.`);
    out[t] = v;
  }
  return out as AllData;
}

/** e. İlişki kontrolü; kopuk kayıtların Türkçe listesini döndürür. */
export function checkRelations(d: AllData): string[] {
  const has = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  const C = has(d.customers), V = has(d.vehicles), W = has(d.workOrders);
  const out: string[] = [];
  for (const v of d.vehicles) if (!C.has(v.customerId)) out.push(`Araç ${v.plate || v.id}: bağlı müşteri bulunamadı`);
  for (const w of d.workOrders) {
    if (!V.has(w.vehicleId)) out.push(`Servis ${w.orderNo || w.id}: bağlı araç bulunamadı`);
    if (!C.has(w.customerId)) out.push(`Servis ${w.orderNo || w.id}: bağlı müşteri bulunamadı`);
  }
  for (const i of d.workOrderItems) if (!W.has(i.workOrderId)) out.push(`Kalem "${i.name || i.id}": bağlı servis bulunamadı`);
  for (const p of d.payments) if (!W.has(p.workOrderId)) out.push(`Ödeme ${p.id}: bağlı servis bulunamadı`);
  return out;
}

export interface PreparedRestore { file: BackupFile; data: AllData; backupCounts: Counts; currentCounts: Counts }
/** b–f: dosyayı doğrular ve geri yüklemeye hazırlar; mevcut veriye dokunmaz. */
export async function prepareRestore(text: string, password = ""): Promise<PreparedRestore> {
  const file = parseBackupFile(text);
  const plain = await decryptAndVerify(file, password);
  checkSchema(file);
  const data = toData(plain, file);
  const broken = checkRelations(data);
  if (broken.length) throw new BackupError(`Yedekte kopuk kayıtlar var, geri yükleme reddedildi:\n- ${broken.slice(0, 20).join("\n- ")}${broken.length > 20 ? `\n… ve ${broken.length - 20} kayıt daha` : ""}`);
  return { file, data, backupCounts: countsOf(data), currentCounts: countsOf(readAllTables()) };
}

/** g. Mevcut verinin güvenlik kopyası (şifresiz, gizli alanlar dahil değil). Tarayıcıda saklar ve metni döndürür. */
export async function takeSafetySnapshot(): Promise<{ text: string; stored: boolean }> {
  const text = await createBackup("");
  return { text, stored: backupMeta.setSnapshot(text) };
}

/** i–j. Tek seferde yazar; hata olursa önceki veri korunur. Gizli ayarlar (API anahtarı) mevcut veriden korunur. */
export function applyRestore(data: AllData, note = "Yedekten geri yükleme"): number {
  const current = readAllTables();
  const secrets = current.settings.filter((s) => SECRET_SETTING_KEYS.includes(s.key));
  const next: AllData = { ...data, settings: [...data.settings.filter((s) => !SECRET_SETTING_KEYS.includes(s.key)), ...secrets] };
  try { replaceAllTables(next); }
  catch { throw new BackupError("Veriler yazılırken hata oluştu (tarayıcı depolaması dolu olabilir). Mevcut veriler korundu."); }
  const total = Object.values(countsOf(data)).reduce((a, b) => a + b, 0);
  logAudit("settings", "backup", "restore", `${note}: ${total} kayıt yüklendi`);
  return total;
}

/** Son geri yüklemeden önce alınan güvenlik kopyasına döner. */
export async function undoLastRestore(): Promise<number> {
  const snap = backupMeta.getSnapshot();
  if (!snap) throw new BackupError("Geri alınacak bir geri yükleme bulunamadı.");
  const p = await prepareRestore(snap);
  return applyRestore(p.data, "Son geri yükleme geri alındı");
}

export const TABLE_LABELS: Record<EntityName, string> = {
  customers: "Müşteriler", vehicles: "Araçlar", employees: "Çalışanlar", workOrders: "Servisler", workOrderItems: "Servis kalemleri",
  payments: "Ödemeler", expenses: "Giderler", smsLogs: "SMS kayıtları", smsTemplates: "SMS şablonları", settings: "Ayarlar",
  auditLogs: "Değişiklik kayıtları", serviceStatuses: "Servis durumları",
};
