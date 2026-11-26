// Veri bütünlüğü: ilişki, yinelenen kayıt, finansal tutarlılık ve zorunlu alan kontrolleri. SALT OKUNUR:
// hiçbir kaydı değiştirmez, silmez, birleştirmez. Yedek doğrulaması ve "Veri Sağlığı" ekranı aynı kodu kullanır.
import { ALL_TABLES, readAllTables, type AllData } from "./repository";
import { normalizePhone, normalizePlate } from "./normalize";
import type { EntityName } from "./types";

export type HealthCategory = "relation" | "duplicate" | "financial" | "field";
export type HealthLink = { to: "/araclar/$id" | "/musteriler/$id"; id: string; label: string };
export type HealthIssue = { category: HealthCategory; severity: "error" | "warning"; message: string; links: HealthLink[] };
export type HealthReport = {
  checkedAt: string; counts: Record<EntityName, number>; issues: HealthIssue[];
  errors: number; warnings: number; byCategory: Record<HealthCategory, number>;
};
export const CATEGORY_LABEL: Record<HealthCategory, string> = { relation: "İlişki hataları", duplicate: "Yinelenen kayıtlar", financial: "Finansal tutarsızlıklar", field: "Eksik / geçersiz alanlar" };

const L = <T,>(a: T[] | undefined): T[] => a ?? [];
const issue = (category: HealthCategory, severity: "error" | "warning", message: string, links: HealthLink[] = []): HealthIssue => ({ category, severity, message, links });
const vLink = (id: string, label: string): HealthLink => ({ to: "/araclar/$id", id, label });
const cLink = (id: string, label: string): HealthLink => ({ to: "/musteriler/$id", id, label });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A. İlişki bütünlüğü. extended=false: yalnızca yedek geri yüklemeyi engelleyen temel bağlar (müşteri/araç/servis/kalem/ödeme/bakım); true: durum ve çalışan kayıtları da. */
export function relationIssues(d: AllData, extended = true): HealthIssue[] {
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  const C = ids(d.customers), V = ids(d.vehicles), W = ids(d.workOrders), S = ids(L(d.serviceStatuses)), E = ids(L(d.employees));
  const out: HealthIssue[] = [];
  for (const m of L(d.maintenanceReminders)) if (!V.has(m.vehicleId)) out.push(issue("relation", "error", `Bakım hatırlatıcı ${m.kind || m.id}: bağlı araç bulunamadı`));
  for (const v of d.vehicles) if (!C.has(v.customerId)) out.push(issue("relation", "error", `Araç ${v.plate || v.id}: bağlı müşteri bulunamadı`, [vLink(v.id, v.plate || "Araç")]));
  for (const w of d.workOrders) {
    const no = w.orderNo || w.id;
    if (!V.has(w.vehicleId)) out.push(issue("relation", "error", `Servis ${no}: bağlı araç bulunamadı`, C.has(w.customerId) ? [cLink(w.customerId, "Müşteri")] : []));
    if (!C.has(w.customerId)) out.push(issue("relation", "error", `Servis ${no}: bağlı müşteri bulunamadı`, V.has(w.vehicleId) ? [vLink(w.vehicleId, "Araç")] : []));
    if (extended && !S.has(w.statusId)) out.push(issue("relation", "error", `Servis ${no}: durum kaydı bulunamadı`, V.has(w.vehicleId) ? [vLink(w.vehicleId, "Araç")] : []));
    if (extended && w.employeeId && !E.has(w.employeeId)) out.push(issue("relation", "warning", `Servis ${no}: çalışan kaydı bulunamadı`, V.has(w.vehicleId) ? [vLink(w.vehicleId, "Araç")] : []));
  }
  for (const i of d.workOrderItems) if (!W.has(i.workOrderId)) out.push(issue("relation", "error", `Kalem "${i.name || i.id}": bağlı servis bulunamadı`));
  for (const p of d.payments) if (!W.has(p.workOrderId)) out.push(issue("relation", "error", `Ödeme ${p.id}: bağlı servis bulunamadı`));
  return out;
}
/** Eski imza: kopuk kayıtların Türkçe metin listesi (yedek doğrulaması ve testler kullanır). */
export const checkRelations = (d: AllData): string[] => relationIssues(d, false).map((i) => i.message);

const trLower = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
function groupBy<T>(rows: T[], key: (r: T) => string | null): T[][] {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (k) m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m.values()].filter((g) => g.length > 1);
}
/** B. Yinelenen kayıtlar. Hiçbiri otomatik birleştirilmez; yalnızca bildirilir. */
export function duplicateIssues(d: AllData): HealthIssue[] {
  const out: HealthIssue[] = [];
  for (const g of groupBy(d.vehicles.filter((v) => !v.archived), (v) => normalizePlate(v.plate ?? "") || null))
    out.push(issue("duplicate", "error", `Aynı plaka birden fazla aktif araçta: ${g[0]!.plate}`, g.map((v) => vLink(v.id, v.plate || "Araç"))));
  for (const g of groupBy(d.workOrders, (w) => w.orderNo || null))
    out.push(issue("duplicate", "error", `Aynı servis numarası ${g.length} kayıtta: ${g[0]!.orderNo}`, g.filter((w) => d.vehicles.some((v) => v.id === w.vehicleId)).map((w) => vLink(w.vehicleId, w.orderNo))));
  const orderOf = new Map(d.workOrders.map((w) => [w.id, w]));
  for (const g of groupBy(d.payments.filter((p) => !p.archived && p.status === "active"), (p) => `${p.workOrderId}|${p.money?.currency}|${p.money?.amount}|${p.method}|${(p.paidAt ?? "").slice(0, 16)}`)) {
    const w = orderOf.get(g[0]!.workOrderId);
    out.push(issue("duplicate", "warning", `Olası mükerrer ödeme: aynı servise, aynı tutar/yöntem/zaman ile ${g.length} kayıt (servis ${w?.orderNo ?? g[0]!.workOrderId})`, w ? [vLink(w.vehicleId, "Araç")] : []));
  }
  const customers = d.customers.filter((c) => !c.archived);
  const phoneGroups = groupBy(customers, (c) => (normalizePhone(c.phone ?? "").length >= 7 ? normalizePhone(c.phone) : null));
  for (const g of phoneGroups) out.push(issue("duplicate", "warning", `Aynı telefon numarası ${g.length} müşteride: ${g[0]!.phone} (farklı kişiler olabilir, otomatik birleştirilmez)`, g.map((c) => cLink(c.id, `${c.firstName} ${c.lastName}`))));
  for (const g of groupBy(customers, (c) => trLower(`${c.firstName ?? ""} ${c.lastName ?? ""}`) || null)) {
    if (new Set(g.map((c) => normalizePhone(c.phone ?? ""))).size === 1 && normalizePhone(g[0]!.phone ?? "").length >= 7) continue; // zaten "aynı telefon" olarak bildirildi
    out.push(issue("duplicate", "warning", `Aynı ad-soyad ${g.length} müşteride: ${g[0]!.firstName} ${g[0]!.lastName} (farklı kişiler olabilir, otomatik birleştirilmez)`, g.map((c) => cLink(c.id, c.phone || "Müşteri"))));
  }
  return out;
}

/** C. Finansal tutarlılık (ham veri üzerinden bağımsız hesap). */
export function financialIssues(d: AllData): HealthIssue[] {
  const out: HealthIssue[] = [];
  const cancelled = new Set(L(d.serviceStatuses).filter((s) => s.kind === "cancelled").map((s) => s.id));
  const items = new Map<string, number>(), paid = new Map<string, number>();
  const orders = new Map(d.workOrders.map((w) => [w.id, w]));
  const where = (wid: string): HealthLink[] => { const w = orders.get(wid); return w && d.vehicles.some((v) => v.id === w.vehicleId) ? [vLink(w.vehicleId, "Araç")] : []; };
  for (const i of d.workOrderItems.filter((x) => !x.archived)) {
    const w = orders.get(i.workOrderId), a = i.amount?.amount;
    if (!Number.isInteger(a) || a < 0) { out.push(issue("financial", "error", `Kalem "${i.name || i.id}": negatif veya geçersiz tutar`, where(i.workOrderId))); continue; }
    if (w && i.amount.currency !== w.currency) out.push(issue("financial", "error", `Kalem "${i.name || i.id}": para birimi servisle aynı değil (${i.amount.currency} ≠ ${w.currency})`, where(i.workOrderId)));
    else items.set(i.workOrderId, (items.get(i.workOrderId) ?? 0) + a);
  }
  for (const p of d.payments.filter((x) => !x.archived)) {
    const w = orders.get(p.workOrderId), a = p.money?.amount;
    if (!Number.isInteger(a) || a <= 0) { out.push(issue("financial", "error", `Ödeme ${p.id}: sıfır, negatif veya geçersiz tutar`, where(p.workOrderId))); continue; }
    if (w && p.money.currency !== w.currency) { out.push(issue("financial", "error", `Ödeme ${p.id}: para birimi servisle aynı değil (${p.money.currency} ≠ ${w.currency})`, where(p.workOrderId))); continue; }
    if (p.status === "active") paid.set(p.workOrderId, (paid.get(p.workOrderId) ?? 0) + a);
  }
  const fmt = (n: number) => (n / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 });
  for (const w of d.workOrders.filter((x) => !x.archived)) {
    const total = items.get(w.id) ?? 0, p = paid.get(w.id) ?? 0, no = w.orderNo || w.id;
    if (p > total) out.push(issue("financial", "error", `Servis ${no}: fazla ödeme (ödenen ${fmt(p)} ${w.currency} > toplam ${fmt(total)} ${w.currency})`, where(w.id)));
    if (cancelled.has(w.statusId) && p > 0) out.push(issue("financial", "warning", `Servis ${no}: iptal edilmiş ama ${fmt(p)} ${w.currency} tahsilat kaydı var (iade gerekebilir)`, where(w.id)));
  }
  void sum;
  return out;
}

type Row = Record<string, unknown>;
const CUR = ["TRY", "USD", "EUR"];
const isStr = (v: unknown): v is string => typeof v === "string";
const strs = (r: Row, ...k: string[]) => k.every((x) => isStr(r[x]));
const isMoney = (m: unknown) => !!m && typeof m === "object" && Number.isInteger((m as Row)["amount"]) && CUR.includes((m as Row)["currency"] as string);
const FIELD_LABEL: Record<EntityName, string> = {
  customers: "Müşteri", vehicles: "Araç", employees: "Çalışan", workOrders: "Servis", workOrderItems: "Servis kalemi", payments: "Ödeme", expenses: "Gider",
  smsLogs: "SMS kaydı", smsTemplates: "SMS şablonu", settings: "Ayar", auditLogs: "Değişiklik kaydı", serviceStatuses: "Servis durumu", maintenanceReminders: "Bakım hatırlatıcı",
};
const REQUIRED: Partial<Record<EntityName, (r: Row) => string | null>> = {
  customers: (r) => (strs(r, "firstName", "lastName", "phone") ? null : "ad, soyad veya telefon eksik"),
  vehicles: (r) => (strs(r, "customerId", "plate") ? null : "müşteri veya plaka eksik"),
  employees: (r) => (strs(r, "name") ? null : "ad eksik"),
  workOrders: (r) => (strs(r, "customerId", "vehicleId", "statusId", "enteredAt") && CUR.includes(r["currency"] as string) ? null : "müşteri, araç, durum, tarih veya para birimi eksik/geçersiz"),
  workOrderItems: (r) => (strs(r, "workOrderId") && isMoney(r["amount"]) ? null : "servis veya tutar geçersiz"),
  payments: (r) => (strs(r, "workOrderId", "paidAt") && isMoney(r["money"]) && ["active", "cancelled", "refunded"].includes(r["status"] as string) ? null : "servis, tutar, tarih veya durum geçersiz"),
  expenses: (r) => (strs(r, "spentAt") && isMoney(r["money"]) ? null : "tutar veya tarih geçersiz"),
  smsLogs: (r) => (strs(r, "phone") ? null : "telefon eksik"),
  smsTemplates: (r) => (strs(r, "name", "body") ? null : "ad veya metin eksik"),
  settings: (r) => (strs(r, "key") ? null : "anahtar eksik"),
  serviceStatuses: (r) => (strs(r, "label") && ["active", "completed", "delivered", "cancelled"].includes(r["kind"] as string) ? null : "etiket veya tür geçersiz"),
  maintenanceReminders: (r) => (strs(r, "vehicleId", "kind") && /^\d{4}-\d{2}-\d{2}$/.test(String(r["lastDoneAt"])) && Number.isInteger(r["intervalMonths"]) && (r["intervalMonths"] as number) > 0 ? null : "araç, tür, tarih veya aralık geçersiz"),
};
/** D. Zorunlu alanlar ve kimlik tekrarı; sorunların Türkçe listesi. */
export function checkRows(d: AllData): string[] {
  const out: string[] = [];
  for (const t of ALL_TABLES) {
    const label = FIELD_LABEL[t] ?? t, seen = new Set<string>();
    for (const r of L(d[t] as unknown as Row[])) {
      if (!r || typeof r !== "object") { out.push(`${label}: geçersiz satır`); continue; }
      if (!isStr(r["id"]) || !r["id"]) { out.push(`${label}: kimliği olmayan kayıt`); continue; }
      const id = r["id"];
      if (seen.has(id)) out.push(`${label} ${id}: aynı kimlik iki kez var`);
      seen.add(id);
      if (!isStr(r["createdAt"])) out.push(`${label} ${id}: oluşturma tarihi yok`);
      const why = REQUIRED[t]?.(r);
      if (why) out.push(`${label} ${id}: ${why}`);
    }
  }
  return out;
}

export function checkIntegrity(d: AllData = readAllTables()): HealthReport {
  const issues = [
    ...relationIssues(d), ...duplicateIssues(d), ...financialIssues(d),
    ...checkRows(d).map((m) => issue("field", "error", m)),
  ];
  const byCategory: Record<HealthCategory, number> = { relation: 0, duplicate: 0, financial: 0, field: 0 };
  for (const i of issues) byCategory[i.category]++;
  const counts = Object.fromEntries(ALL_TABLES.map((t) => [t, L(d[t] as unknown[]).length])) as Record<EntityName, number>;
  return { checkedAt: new Date().toISOString(), counts, issues, errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length, byCategory };
}

const LAST_KEY = "otoservis:health-last";
export function getLastHealth(): { at: string; errors: number; warnings: number } | null {
  try { const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LAST_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
/** Kontrolü çalıştırır ve özetini (tarih, sayılar) saklar. Kayıtlara dokunmaz. */
export function runHealthCheck(): HealthReport {
  const r = checkIntegrity();
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: r.checkedAt, errors: r.errors, warnings: r.warnings })); } catch { /* saklanamazsa önemli değil */ }
  return r;
}
