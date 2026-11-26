// Tek veri erişim katmanı. UI asla localStorage'a doğrudan dokunmaz.
import type { MaintenanceReminder, SmsLog, AuditLog, BaseRecord, Currency, Customer, Expense, EntityMap, EntityName, Money, Payment, PaymentMethod, ServiceStatus, Vehicle, WorkOrder, WorkOrderItem } from "./types";
import { normalizePhone, normalizePlate, trLower } from "./normalize";
import { formatMoney } from "./money";
import { formatDate } from "./format";
import { inRange, periodRange, splitRange, type BucketUnit, type Range } from "./periods";

const PREFIX = "otoservis:";
const isBrowser = () => typeof window !== "undefined";

function read<K extends EntityName>(name: K): EntityMap[K][] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(PREFIX + name) ?? "[]"); } catch { return []; }
}
function write<K extends EntityName>(name: K, rows: EntityMap[K][]) {
  localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  notify();
}

// Değişiklik bildirimi: UI bu sayede güncellenir.
const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function audit(entity: EntityName, entityId: string, action: AuditLog["action"], details?: string) {
  if (entity === "auditLogs") return;
  const rows = read("auditLogs");
  rows.push({ id: newId(), createdAt: now(), archived: false, entity, entityId, action, ...(details ? { details } : {}) });
  write("auditLogs", rows);
}

type NewInput<T> = Omit<T, keyof BaseRecord>;

type Validate<T> = (row: T, ctx: { existing: T[] }) => void;

export function createRepo<K extends EntityName>(name: K, validate?: Validate<EntityMap[K]>) {
  type T = EntityMap[K];
  const load = () => read(name) as T[];
  const save = (rows: T[]) => write(name, rows as EntityMap[K][]);
  return {
    list(opts: { includeArchived?: boolean } = {}): T[] {
      const rows = load();
      return opts.includeArchived ? rows : rows.filter((r) => !r.archived);
    },
    get(id: string): T | undefined { return load().find((r) => r.id === id); },
    create(input: NewInput<T>): T {
      const row = { ...input, id: newId(), createdAt: now(), archived: false } as T;
      validate?.(row, { existing: load() });
      save([...load(), row]);
      audit(name, row.id, "create");
      return row;
    },
    update(id: string, patch: Partial<NewInput<T>>): T {
      const rows = load();
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("Kayıt bulunamadı");
      const prev = rows[i]!;
      const next = { ...prev, ...patch, id: prev.id, createdAt: prev.createdAt } as T;
      validate?.(next, { existing: rows.filter((_, j) => j !== i) });
      rows[i] = next;
      save(rows);
      // Değişen alanları eski → yeni olarak kaydet.
      const changes = Object.keys(patch).filter((k) => JSON.stringify((prev as never)[k]) !== JSON.stringify((rows[i] as never)[k]))
        .map((k) => `${k}: ${JSON.stringify((prev as never)[k]) ?? "—"} → ${JSON.stringify((rows[i] as never)[k]) ?? "—"}`);
      if (changes.length) audit(name, id, "update", changes.join("; "));
      return rows[i]!;
    },
    /** Kalıcı silme (yalnızca iş kurallarını denetleyen üst fonksiyonlar çağırmalı). */
    remove(id: string) {
      const rows = load();
      if (!rows.some((r) => r.id === id)) throw new Error("Kayıt bulunamadı");
      save(rows.filter((r) => r.id !== id));
      audit(name, id, "delete");
    },
    /** Arşivleme: kayıt kalır, listelerden gizlenir. */
    archive(id: string) { setArchived(name, id, true); audit(name, id, "archive"); },
    restore(id: string) {
      const cur = load().find((r) => r.id === id);
      if (cur) validate?.({ ...cur, archived: false }, { existing: load().filter((r) => r.id !== id) }); // arşivden dönerken de plaka vb. çakışmasın
      setArchived(name, id, false); audit(name, id, "restore");
    },
  };
}
function setArchived(name: EntityName, id: string, value: boolean) {
  const rows = read(name) as BaseRecord[];
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error("Kayıt bulunamadı");
  r.archived = value;
  localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  notify();
}

// Kayıt bütünlüğü kuralları (kaydetmeden önce): sahipsiz kayıt ve aynı plaka/servis numarası oluşamaz.
const vehicleRule: Validate<Vehicle> = (v, { existing }) => {
  if (!repo.customers.get(v.customerId)) throw new Error("Araç için geçerli bir müşteri seçilmeli.");
  const p = normalizePlate(v.plate ?? "");
  if (p && !v.archived && existing.some((o) => !o.archived && normalizePlate(o.plate ?? "") === p)) throw new Error(`${p} plakası zaten aktif bir araçta kayıtlı.`);
};
const orderRule: Validate<WorkOrder> = (w, { existing }) => {
  if (!repo.customers.get(w.customerId)) throw new Error("Servis için geçerli bir müşteri gerekli.");
  if (!repo.vehicles.get(w.vehicleId)) throw new Error("Servis için geçerli bir araç gerekli.");
  if (w.orderNo && existing.some((o) => o.orderNo === w.orderNo)) throw new Error(`${w.orderNo} servis numarası zaten kullanılıyor.`);
};
const itemRule: Validate<WorkOrderItem> = (i) => { if (!repo.workOrders.get(i.workOrderId)) throw new Error("Kalem için geçerli bir servis gerekli."); };
const paymentRule: Validate<Payment> = (p) => { if (!repo.workOrders.get(p.workOrderId)) throw new Error("Ödeme için geçerli bir servis gerekli."); };

export const repo = {
  customers: createRepo("customers"), vehicles: createRepo("vehicles", vehicleRule), employees: createRepo("employees"),
  workOrders: createRepo("workOrders", orderRule), workOrderItems: createRepo("workOrderItems", itemRule), payments: createRepo("payments", paymentRule),
  expenses: createRepo("expenses"), smsLogs: createRepo("smsLogs"), settings: createRepo("settings"),
  auditLogs: createRepo("auditLogs"), serviceStatuses: createRepo("serviceStatuses"), smsTemplates: createRepo("smsTemplates"),
  maintenanceReminders: createRepo("maintenanceReminders"),
};

// Tema tercihi (veri değil, arayüz tercihi) de bu katmandan geçer.
export type Theme = "light" | "dark";
export const preferences = {
  getTheme(): Theme { return isBrowser() && localStorage.getItem(PREFIX + "theme") === "dark" ? "dark" : "light"; },
  setTheme(t: Theme) { localStorage.setItem(PREFIX + "theme", t); },
};

// ---- Müşteri / araç sorguları ----
export const customerName = (c: Pick<Customer, "firstName" | "lastName">) => `${c.firstName} ${c.lastName}`;

export function searchCustomers(query: string, includeArchived = false): Customer[] {
  const all = repo.customers.list({ includeArchived });
  const q = trLower(query.trim());
  if (!q) return all;
  const qPhone = query.replace(/\D/g, "");
  return all.filter((c) =>
    trLower(customerName(c)).includes(q) ||
    (qPhone.length > 0 && [c.phone, c.phone2].some((p) => p && p.replace(/\D/g, "").includes(qPhone))),
  );
}

/** Aynı telefona sahip başka (arşivsiz) müşteriler. */
export function findDuplicatePhone(phone: string, excludeId?: string): Customer[] {
  const n = normalizePhone(phone);
  if (n.length < 7) return [];
  return repo.customers.list().filter((c) => c.id !== excludeId && [c.phone, c.phone2].some((p) => p && normalizePhone(p) === n));
}

export function searchVehiclesByPlate(query: string, limit = 8): Vehicle[] {
  const q = normalizePlate(query);
  if (!q) return [];
  return repo.vehicles.list().filter((v) => v.plate.includes(q))
    .sort((a, b) => Number(b.plate.startsWith(q)) - Number(a.plate.startsWith(q)) || a.plate.localeCompare(b.plate))
    .slice(0, limit);
}

export function findVehicleByPlate(plate: string, excludeId?: string): Vehicle | undefined {
  const n = normalizePlate(plate);
  return repo.vehicles.list().find((v) => v.plate === n && v.id !== excludeId);
}

export const vehiclesOfCustomer = (customerId: string) => repo.vehicles.list().filter((v) => v.customerId === customerId);
export const workOrdersOfVehicle = (vehicleId: string) =>
  repo.workOrders.list().filter((w) => w.vehicleId === vehicleId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const workOrdersOfCustomer = (customerId: string) =>
  repo.workOrders.list().filter((w) => w.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export type CurrencyBalance = { currency: Currency; total: number; paid: number; unpaid: number };
/**
 * Para birimi bazında ayrı toplam/ödenen/kalan. Birimler asla birleştirilmez.
 * Servis (workOrderId) bazında hesaplanır: yalnızca o servise bağlı, status=active ödemeler sayılır.
 * vehicleId verilirse yalnızca o aracın servisleri dahil edilir.
 */
export function customerBalance(customerId: string, vehicleId?: string): CurrencyBalance[] {
  const orders = workOrdersOfCustomer(customerId).filter((w) => !vehicleId || w.vehicleId === vehicleId);
  const out = new Map<Currency, CurrencyBalance>();
  for (const w of orders) {
    const b = orderBalance(w.id);
    if (!b || b.cancelled) continue; // iptal edilen servis toplam/borca girmez
    const r = out.get(b.currency) ?? { currency: b.currency, total: 0, paid: 0, unpaid: 0 };
    r.total += b.total; r.paid += b.paid; r.unpaid += b.remaining;
    out.set(b.currency, r);
  }
  return Array.from(out.values());
}

// ---- Örnek veri (ilk açılışta bir kez) ----
export function ensureSeeded() {
  if (!isBrowser()) return;
  ensureServiceDefaults();
  if (localStorage.getItem(PREFIX + "seeded")) return;
  localStorage.setItem(PREFIX + "seeded", "1");
  if (repo.customers.list({ includeArchived: true }).length) return;
  const cs = [
    { firstName: "Mehmet", lastName: "Yılmaz", phone: "0532 111 22 33", address: "Kadıköy, İstanbul" },
    { firstName: "Ayşe", lastName: "Kaya", phone: "0541 222 33 44", phone2: "0216 444 55 66" },
    { firstName: "Hüseyin", lastName: "Demir", phone: "0505 333 44 55", note: "Sadece öğleden sonra aranmalı." },
    { firstName: "Şule", lastName: "Çelik", phone: "0533 444 55 66", address: "Çankaya, Ankara" },
    { firstName: "İbrahim", lastName: "Öztürk", phone: "0544 555 66 77" },
  ].map((c) => repo.customers.create(c));
  const vs: [number, string, string, string, number, string][] = [
    [0, "34 ABC 123", "Renault", "Clio", 2018, "Otomobil"],
    [0, "34 XY 4567", "Ford", "Transit", 2015, "Kamyonet"],
    [1, "06 DEF 456", "Fiat", "Egea", 2021, "Otomobil"],
    [2, "35 GH 789", "Volkswagen", "Passat", 2016, "Otomobil"],
    [2, "35 KL 1010", "Toyota", "Hilux", 2019, "Pikap"],
    [2, "35 MN 202", "Honda", "PCX", 2022, "Motosiklet"],
    [3, "06 PR 3030", "Hyundai", "i20", 2020, "Otomobil"],
    [4, "16 ST 404", "Dacia", "Duster", 2017, "SUV"],
  ];
  for (const [ci, plate, brand, model, year, type] of vs)
    repo.vehicles.create({ customerId: cs[ci]!.id, plate: normalizePlate(plate), brand, model, year, type });
}

// ---- Servis (iş emri) ----
export const DEFAULT_STATUSES: Omit<ServiceStatus, keyof BaseRecord>[] = [
  { label: "Yeni", kind: "active", order: 10, builtin: true },
  { label: "Bekliyor", kind: "active", order: 20, builtin: true },
  { label: "Devam ediyor", kind: "active", order: 30, builtin: true },
  { label: "Tamamlandı", kind: "completed", order: 80, builtin: true },
  { label: "Teslim edildi", kind: "delivered", order: 90, builtin: true },
  { label: "İptal", kind: "cancelled", order: 100, builtin: true },
];
/** Durumlar ve örnek çalışanlar (mevcut veriye de bir kez eklenir). */
export function ensureServiceDefaults() {
  if (!isBrowser() || localStorage.getItem(PREFIX + "serviceDefaults")) return;
  localStorage.setItem(PREFIX + "serviceDefaults", "1");
  if (!repo.serviceStatuses.list({ includeArchived: true }).length) DEFAULT_STATUSES.forEach((s) => repo.serviceStatuses.create(s));
  if (!repo.employees.list({ includeArchived: true }).length)
    [{ name: "Ahmet Usta", role: "Mekanik" }, { name: "Kemal", role: "Elektrik" }].forEach((e) => repo.employees.create(e));
}
export const listStatuses = (includeArchived = false) =>
  repo.serviceStatuses.list({ includeArchived }).sort((a, b) => a.order - b.order);
export const statusOf = (w: WorkOrder) => repo.serviceStatuses.get(w.statusId);
/** Aktif = durumu "active" türünde olan iş emirleri. Tamamlanan/teslim/iptal geçmişte kalır. */
export const isActiveOrder = (w: WorkOrder) => statusOf(w)?.kind === "active";

export function addStatus(label: string): ServiceStatus {
  const active = listStatuses(true).filter((s) => s.kind === "active");
  const order = Math.max(0, ...active.map((s) => s.order)) + 1;
  return repo.serviceStatuses.create({ label: label.trim(), kind: "active", order, builtin: false });
}

/** Yıl içinde artan benzersiz no: IE-2026-0001 */
export function nextOrderNo(date = new Date()): string {
  const prefix = `IE-${date.getFullYear()}-`;
  const max = repo.workOrders.list({ includeArchived: true }).filter((w) => w.orderNo?.startsWith(prefix))
    .reduce((m, w) => Math.max(m, Number(w.orderNo.slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(4, "0");
}

export const itemsOfOrder = (workOrderId: string) =>
  repo.workOrderItems.list().filter((i) => i.workOrderId === workOrderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export function orderTotal(workOrderId: string, currency: Currency): number {
  return itemsOfOrder(workOrderId).filter((i) => i.amount.currency === currency).reduce((s, i) => s + i.amount.amount, 0);
}

/** Durum değişince: tamamlandı/teslim türüne ilk geçişte tamamlanma tarihi kaydedilir. Ödemeyle ilgisi yoktur. */
export function setOrderStatus(id: string, statusId: string): WorkOrder {
  const w = repo.workOrders.get(id);
  const st = repo.serviceStatuses.get(statusId);
  if (!w || !st) throw new Error("Kayıt bulunamadı");
  const done = st.kind === "completed" || st.kind === "delivered";
  const completedAt = done ? (w.completedAt ?? now()) : st.kind === "active" ? undefined : w.completedAt;
  const prevKind = repo.serviceStatuses.get(w.statusId)?.kind;
  const out = repo.workOrders.update(id, { statusId, completedAt });
  if (st.kind === "completed" && prevKind !== "completed") emitCompleted(id);
  return out;
}

export const isOrderCompleted = (w: WorkOrder) => !!w.completedAt || statusOf(w)?.kind === "completed" || statusOf(w)?.kind === "delivered";

export type ItemInput = { id?: string | undefined; name: string; kind: WorkOrderItem["kind"]; description?: string | undefined; amount: number };
export type OrderInput = Omit<WorkOrder, keyof BaseRecord | "orderNo" | "completedAt">;

/** İş emrini kalemleriyle birlikte kaydeder. Tamamlanmış servisin kalemleri silinemez. */
export function saveWorkOrder(input: OrderInput, items: ItemInput[], existingId?: string): WorkOrder {
  let order: WorkOrder;
  if (existingId) {
    const prev = repo.workOrders.get(existingId);
    if (!prev) throw new Error("Kayıt bulunamadı");
    const keep = new Set(items.filter((i) => i.id).map((i) => i.id));
    const removed = itemsOfOrder(existingId).filter((i) => !keep.has(i.id));
    if (removed.length && isOrderCompleted(prev)) throw new Error("Tamamlanmış servisin kalemleri silinemez.");
    // Ödeme kaydı olan serviste para birimi değişemez, toplam ödenenin altına düşemez.
    const paid = paidOfOrder(existingId);
    if (paid > 0 && input.currency !== prev.currency) throw new Error("Ödeme kaydı olan servisin para birimi değiştirilemez.");
    const newTotal = items.reduce((t, i) => t + i.amount, 0);
    if (newTotal < paid) throw new Error(`Servis toplamı ödenen tutarın (${formatMoney({ amount: paid, currency: prev.currency })}) altına düşemez.`);
    const { statusId, ...rest } = input;
    repo.workOrders.update(existingId, rest);
    order = statusId !== prev.statusId ? setOrderStatus(existingId, statusId) : repo.workOrders.get(existingId)!;
    for (const r of removed) deleteItem(r.id);
  } else {
    order = repo.workOrders.create({ ...input, orderNo: nextOrderNo(new Date(input.enteredAt)) });
    const st = repo.serviceStatuses.get(input.statusId);
    if (st && (st.kind === "completed" || st.kind === "delivered")) order = repo.workOrders.update(order.id, { completedAt: now() });
    if (st?.kind === "completed") emitCompleted(order.id);
  }
  for (const it of items) {
    const data = { workOrderId: order.id, name: it.name, kind: it.kind, description: it.description, amount: { amount: it.amount, currency: input.currency } };
    if (it.id) repo.workOrderItems.update(it.id, data); else repo.workOrderItems.create(data);
  }
  return order;
}

function deleteItem(id: string) {
  const rows = read("workOrderItems");
  const it = rows.find((r) => r.id === id);
  if (!it) return;
  const w = repo.workOrders.get(it.workOrderId);
  if (w && isOrderCompleted(w)) throw new Error("Tamamlanmış servisin kalemleri silinemez.");
  write("workOrderItems", rows.filter((r) => r.id !== id));
  audit("workOrderItems", id, "delete", `${it.name} (${it.amount.amount / 100} ${it.amount.currency})`);
}
export const auditOf = (entityId: string) =>
  repo.auditLogs.list().filter((a) => a.entityId === entityId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));


// ---- Ödeme TAKİBİ ----
// Tahsilat uygulama dışında yapılır; burada yalnızca "ödeme alındı" kaydı tutulur. Ödeme silinmez, iptal/iade olarak işaretlenir.
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Nakit" },
  { value: "debit_card", label: "Banka kartı" },
  { value: "credit_card", label: "Kredi kartı" },
  { value: "transfer", label: "Havale / EFT" },
  { value: "other", label: "Diğer" },
];
export const paymentMethodLabel = (m: PaymentMethod | string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

/** Bir servisin tüm ödeme kayıtları (iptal/iade dahil), en yenisi önce. */
export const paymentsOfOrder = (workOrderId: string) =>
  repo.payments.list().filter((p) => p.workOrderId === workOrderId)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.createdAt.localeCompare(a.createdAt));
/** Eski kayıtlarda status alanı yoksa active sayılır. */
const isActivePayment = (p: Payment) => (p.status ?? "active") === "active";
const activePaymentsOfOrder = (workOrderId: string) => paymentsOfOrder(workOrderId).filter(isActivePayment);
function paidOfOrder(workOrderId: string): number {
  const w = repo.workOrders.get(workOrderId);
  if (!w) return 0;
  return activePaymentsOfOrder(workOrderId).filter((p) => p.money.currency === w.currency).reduce((t, p) => t + p.money.amount, 0);
}

/** Ödeme durumu SAKLANMAZ, her seferinde hesaplanır. */
export type PaymentState = "unpaid" | "partial" | "paid";
export type OrderPaymentState = PaymentState | "cancelled";
export const PAYMENT_STATE_LABEL: Record<OrderPaymentState, string> = { unpaid: "Bekliyor", partial: "Kısmi ödeme", paid: "Tamamen ödendi", cancelled: "İptal" };
export type OrderBalance = { currency: Currency; total: number; paid: number; remaining: number; state: OrderPaymentState; cancelled: boolean; lastPaidAt?: string | undefined };

/** Kalan borç = servis kalem toplamı − yalnızca status=active ödemeler. */
export function orderBalance(workOrderId: string): OrderBalance | undefined {
  const w = repo.workOrders.get(workOrderId);
  if (!w) return undefined;
  return balanceFrom(w, itemsOfOrder(w.id), activePaymentsOfOrder(w.id), statusOf(w)?.kind === "cancelled");
}
/** Tek hesap kuralı: items = servisin kalemleri, active = geçerli ödemeleri (en yenisi önce). */
/** İptal edilen servis: borç yok (remaining=0), durum "cancelled". Önceden alınmış gerçek tahsilat (paid) kayıtlı kalır. */
function balanceFrom(w: WorkOrder, items: WorkOrderItem[], active: Payment[], cancelled = false): OrderBalance {
  const total = items.filter((i) => i.amount.currency === w.currency).reduce((s, i) => s + i.amount.amount, 0);
  const paid = active.filter((p) => p.money.currency === w.currency).reduce((t, p) => t + p.money.amount, 0);
  if (cancelled) return { currency: w.currency, total, paid, remaining: 0, state: "cancelled", cancelled: true, lastPaidAt: active[0]?.paidAt };
  const remaining = total - paid;
  const state: PaymentState = total > 0 && remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { currency: w.currency, total, paid, remaining, state, cancelled: false, lastPaidAt: active[0]?.paidAt };
}

export type PaymentInput = { workOrderId: string; money: Money; method: PaymentMethod; paidAt: string; note?: string | undefined };
/** Ödeme kaydı ekler. Para birimi servisinkinden farklıysa veya kalan borçtan fazlaysa reddeder. */
export function recordPayment(input: PaymentInput): Payment {
  const w = repo.workOrders.get(input.workOrderId);
  if (!w) throw new Error("Servis bulunamadı.");
  if (statusOf(w)?.kind === "cancelled") throw new Error("İptal edilmiş servise ödeme kaydı girilemez.");
  const { amount, currency } = input.money;
  // Çift tıklama koruması: aynı servise aynı tutar/yöntem 30 sn içinde ikinci kez girilemez.
  if (repo.payments.list().some((p) => p.workOrderId === w.id && p.status === "active" && p.money.amount === amount && p.money.currency === currency && p.method === input.method && Date.now() - new Date(p.createdAt).getTime() < 30_000))
    throw new Error("Aynı tutarda ödeme az önce kaydedilmiş. Çift tıklama olmuş olabilir; ödeme listesine bakın.");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");
  if (currency !== w.currency) throw new Error(`Ödemenin para birimi (${currency}) servisin para biriminden (${w.currency}) farklı olamaz.`);
  if (!PAYMENT_METHODS.some((m) => m.value === input.method)) throw new Error("Geçersiz ödeme yöntemi.");
  if (!input.paidAt || Number.isNaN(Date.parse(input.paidAt))) throw new Error("Ödeme tarihi geçersiz.");
  const b = orderBalance(w.id)!;
  if (amount > b.remaining) throw new Error(`Fazla ödeme girilemez. Kalan borç: ${formatMoney({ amount: Math.max(0, b.remaining), currency })}.`);
  const p = repo.payments.create({
    workOrderId: w.id, customerId: w.customerId, money: { amount, currency }, method: input.method,
    status: "active", paidAt: input.paidAt, note: input.note?.trim() || undefined,
  });
  audit("workOrders", w.id, "update", `Ödeme kaydı eklendi: ${formatMoney(p.money)} (${paymentMethodLabel(p.method)})`);
  return p;
}

/** Yanlış ödeme silinmez: iptal veya iade olarak işaretlenir. Yalnızca aktif ödeme işaretlenebilir. */
export function markPayment(id: string, status: "cancelled" | "refunded"): Payment {
  const p = repo.payments.get(id);
  if (!p) throw new Error("Ödeme bulunamadı.");
  if (!isActivePayment(p)) throw new Error("Bu ödeme zaten iptal/iade olarak işaretlenmiş.");
  const updated = repo.payments.update(id, { status });
  audit("workOrders", p.workOrderId, "update", `Ödeme ${status === "cancelled" ? "iptal edildi" : "iade edildi"}: ${formatMoney(p.money)} (${formatDate(p.paidAt)})`);
  return updated;
}

// ---- Gider ----
export const EXPENSE_CATEGORIES = ["Kira", "Elektrik", "Su", "Personel", "Parça alımı", "Ekipman", "Bakım onarım", "Diğer"] as const;
export type ExpenseInput = { category: string; description?: string | undefined; money: Money; method: PaymentMethod; spentAt: string };
export function recordExpense(input: ExpenseInput): Expense {
  const { amount, currency } = input.money;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");
  if (!(["TRY", "USD", "EUR"] as Currency[]).includes(currency)) throw new Error("Geçersiz para birimi.");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) throw new Error("Geçersiz kategori.");
  if (!PAYMENT_METHODS.some((m) => m.value === input.method)) throw new Error("Geçersiz ödeme yöntemi.");
  if (!input.spentAt || Number.isNaN(Date.parse(input.spentAt))) throw new Error("Tarih geçersiz.");
  return repo.expenses.create({ category: input.category, description: input.description?.trim() || undefined, money: { amount, currency }, method: input.method, spentAt: input.spentAt });
}
export const expensesIn = (r: Range) =>
  repo.expenses.list().filter((e) => inRange(e.spentAt, r)).sort((a, b) => b.spentAt.localeCompare(a.spentAt) || b.createdAt.localeCompare(a.createdAt));
/** Dönemdeki gerçek tahsilat: ödeme tarihine göre, yalnızca geçerli (iptal/iade olmayan) ödemeler. */
export const collectionsIn = (r: Range) =>
  repo.payments.list().filter((p) => isActivePayment(p) && inRange(p.paidAt, r)).sort((a, b) => b.paidAt.localeCompare(a.paidAt));

// ---- Dönem özeti ----
/**
 * Para birimi bazında ayrı (asla birleştirilmez):
 * - revenue (ciro): dönemde açılan (giriş tarihi) servislerin kalem toplamı
 * - collected (tahsilat/gelir): ödeme tarihine göre dönemdeki geçerli ödemeler
 * - pending (bekleyen): dönemde açılan servislerin kalan borcu
 * - expense (gider): dönemdeki giderler
 * - net: tahsilat − gider
 */
export type PeriodSummary = { currency: Currency; revenue: number; collected: number; pending: number; expense: number; net: number };
export function periodSummary(r: Range): PeriodSummary[] {
  const out = new Map<Currency, PeriodSummary>();
  const row = (c: Currency) => { let x = out.get(c); if (!x) { x = { currency: c, revenue: 0, collected: 0, pending: 0, expense: 0, net: 0 }; out.set(c, x); } return x; };
  row("TRY");
  const cancelledIds = new Set(repo.serviceStatuses.list({ includeArchived: true }).filter((s) => s.kind === "cancelled").map((s) => s.id));
  for (const w of repo.workOrders.list().filter((w) => inRange(w.enteredAt, r) && !cancelledIds.has(w.statusId))) {
    const b = orderBalance(w.id)!;
    const x = row(b.currency); x.revenue += b.total; x.pending += Math.max(0, b.remaining);
  }
  for (const p of collectionsIn(r)) row(p.money.currency).collected += p.money.amount;
  for (const e of expensesIn(r)) row(e.money.currency).expense += e.money.amount;
  for (const x of out.values()) x.net = x.collected - x.expense;
  const order: Currency[] = ["TRY", "USD", "EUR"];
  return Array.from(out.values()).sort((a, b) => order.indexOf(a.currency) - order.indexOf(b.currency));
}

// ---- Servis göstergeleri ----
export function serviceIndicators(now = new Date()) {
  const orders = repo.workOrders.list();
  const kind = (w: WorkOrder) => statusOf(w)?.kind;
  const today = periodRange("today", now);
  return {
    inProgress: orders.filter((w) => kind(w) === "active").length,
    awaitingDelivery: orders.filter((w) => kind(w) === "completed").length,
    awaitingPayment: orders.filter((w) => (orderBalance(w.id)?.remaining ?? 0) > 0).length,
    openedToday: orders.filter((w) => inRange(w.enteredAt, today)).length,
    recentCompleted: orders.filter((w) => w.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 5),
  };
}

// ---- Raporlar ----
/** Tarih dışındaki filtreler servise uygulanır; ödemeler bağlı oldukları servis üzerinden süzülür. Gider servise bağlı değildir. */
export type ReportFilter = {
  range: Range; currency?: Currency | undefined; statusId?: string | undefined; paymentState?: PaymentState | undefined;
  customer?: string | undefined; plate?: string | undefined;
};
/** Müşteri/plaka/işlem/ödeme durumu filtresi var mı? (gider bu filtrelere uymaz) */
export const hasOrderFilter = (f: ReportFilter) => !!(f.statusId || f.paymentState || f.customer?.trim() || f.plate?.trim());
const CUR_ORDER: Currency[] = ["TRY", "USD", "EUR"];

function reportSnapshot(f: ReportFilter) {
  const all = repo.workOrders.list({ includeArchived: true });
  const itemsBy = new Map<string, WorkOrderItem[]>();
  for (const i of repo.workOrderItems.list()) { const a = itemsBy.get(i.workOrderId) ?? []; a.push(i); itemsBy.set(i.workOrderId, a); }
  const activePays = repo.payments.list().filter(isActivePayment).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const paysBy = new Map<string, Payment[]>();
  for (const p of activePays) { const a = paysBy.get(p.workOrderId) ?? []; a.push(p); paysBy.set(p.workOrderId, a); }
  const kinds = new Map(repo.serviceStatuses.list({ includeArchived: true }).map((s) => [s.id, s.kind]));
  const balances = new Map(all.map((w) => [w.id, balanceFrom(w, itemsBy.get(w.id) ?? [], paysBy.get(w.id) ?? [], kinds.get(w.statusId) === "cancelled")]));
  const vehicles = new Map(repo.vehicles.list({ includeArchived: true }).map((v) => [v.id, v]));
  const customers = new Map(repo.customers.list({ includeArchived: true }).map((c) => [c.id, c]));
  const customerIds = f.customer?.trim() ? new Set(searchCustomers(f.customer, true).map((c) => c.id)) : undefined;
  const plate = f.plate ? normalizePlate(f.plate) : "";
  const matches = (w: WorkOrder) => (!f.currency || w.currency === f.currency) && (!f.statusId || w.statusId === f.statusId)
    && (!f.paymentState || balances.get(w.id)!.state === f.paymentState) && (!customerIds || customerIds.has(w.customerId))
    && (!plate || (vehicles.get(w.vehicleId)?.plate ?? "").includes(plate));
  const byId = new Map(all.map((w) => [w.id, w]));
  /** Dönemde açılan (giriş tarihi), arşivlenmemiş ve filtreye uyan servisler. */
  const opened = all.filter((w) => !w.archived && inRange(w.enteredAt, f.range) && matches(w));
  /** Ödeme tarihi dönemde olan, geçerli ve servisi filtreye uyan ödemeler. */
  const collections = activePays.filter((p) => {
    if (!inRange(p.paidAt, f.range)) return false;
    const w = byId.get(p.workOrderId);
    return w ? matches(w) : !hasOrderFilter(f) && (!f.currency || p.money.currency === f.currency);
  });
  return { opened, collections, balances, vehicles, customers, kinds };
}

export type SeriesPoint = { label: string; value: number };
export type ServiceReport = { opened: number; active: number; completed: number; delivered: number; cancelled: number; series: SeriesPoint[] };
/** Dönemde açılan servisler, şu anki durum türüne göre ayrılır. */
export function serviceReport(f: ReportFilter, unit: BucketUnit): ServiceReport {
  const { opened, kinds } = reportSnapshot(f);
  const n = (k: string) => opened.filter((w) => kinds.get(w.statusId) === k).length;
  return {
    opened: opened.length, active: n("active"), completed: n("completed"), delivered: n("delivered"), cancelled: n("cancelled"),
    series: splitRange(f.range, unit).map((b) => ({ label: b.label, value: opened.filter((w) => inRange(w.enteredAt, b)).length })),
  };
}

export type MethodPoint = { method: PaymentMethod; label: string; value: number; count: number };
export type FinanceReportRow = {
  currency: Currency; collected: number; pending: number; pendingCount: number; partial: number; partialCount: number;
  expense: number; net: number; series: SeriesPoint[]; byMethod: MethodPoint[];
};
/** Para birimi başına ayrı satır; birimler asla birleştirilmez. */
export function financeReport(f: ReportFilter, unit: BucketUnit): FinanceReportRow[] {
  const { opened, collections, balances } = reportSnapshot(f);
  const expenses = repo.expenses.list().filter((e) => inRange(e.spentAt, f.range) && (!f.currency || e.money.currency === f.currency));
  const buckets = splitRange(f.range, unit);
  const present = new Set<Currency>([...opened.map((w) => w.currency), ...collections.map((p) => p.money.currency), ...expenses.map((e) => e.money.currency)]);
  const currencies = f.currency ? [f.currency] : CUR_ORDER.filter((c) => present.has(c));
  if (!currencies.length) currencies.push("TRY");
  return currencies.map((c) => {
    const pays = collections.filter((p) => p.money.currency === c);
    const sum = (xs: { money: Money }[]) => xs.reduce((t, x) => t + x.money.amount, 0);
    const owing = opened.filter((w) => w.currency === c).map((w) => balances.get(w.id)!).filter((b) => b.remaining > 0);
    const partials = owing.filter((b) => b.state === "partial");
    const collected = sum(pays), expense = sum(expenses.filter((e) => e.money.currency === c));
    return {
      currency: c, collected, expense, net: collected - expense,
      pending: owing.reduce((t, b) => t + b.remaining, 0), pendingCount: owing.length,
      partial: partials.reduce((t, b) => t + b.remaining, 0), partialCount: partials.length,
      series: buckets.map((b) => ({ label: b.label, value: sum(pays.filter((p) => inRange(p.paidAt, b))) })),
      byMethod: PAYMENT_METHODS.map((m) => {
        const xs = pays.filter((p) => p.method === m.value);
        return { method: m.value, label: m.label, value: sum(xs), count: xs.length };
      }),
    };
  });
}

export type VehicleReportRow = { vehicleId: string; plate: string; vehicle: string; customerId: string; customer: string; count: number; totals: Money[] };
export type CustomerReportRow = { customerId: string; customer: string; phone: string; currency: Currency; orders: number; collected: number; pending: number };
/** En çok işlem gören araçlar (ilk 10) ve müşteri × para birimi bazında tahsilat / bekleyen borç. */
export function vehicleCustomerReport(f: ReportFilter, limit = 10): { vehicles: VehicleReportRow[]; customers: CustomerReportRow[] } {
  const { opened, collections, balances, vehicles, customers } = reportSnapshot(f);
  const vm = new Map<string, VehicleReportRow>();
  for (const w of opened) {
    let r = vm.get(w.vehicleId);
    if (!r) {
      const v = vehicles.get(w.vehicleId), c = customers.get(v?.customerId ?? w.customerId);
      r = { vehicleId: w.vehicleId, plate: v?.plate ?? "—", vehicle: v ? `${v.brand} ${v.model}` : "—", customerId: c?.id ?? "", customer: c ? customerName(c) : "—", count: 0, totals: [] };
      vm.set(w.vehicleId, r);
    }
    r.count++;
    const b = balances.get(w.id)!;
    const t = r.totals.find((m) => m.currency === b.currency);
    if (t) t.amount += b.total; else r.totals.push({ amount: b.total, currency: b.currency });
  }
  const vs = Array.from(vm.values()).sort((a, b) => b.count - a.count || a.plate.localeCompare(b.plate)).slice(0, limit);
  for (const v of vs) v.totals.sort((a, b) => CUR_ORDER.indexOf(a.currency) - CUR_ORDER.indexOf(b.currency));

  const cm = new Map<string, CustomerReportRow>();
  const row = (customerId: string, currency: Currency) => {
    const k = `${customerId}|${currency}`;
    let r = cm.get(k);
    if (!r) { const c = customers.get(customerId); r = { customerId, customer: c ? customerName(c) : "—", phone: c?.phone ?? "", currency, orders: 0, collected: 0, pending: 0 }; cm.set(k, r); }
    return r;
  };
  for (const w of opened) { const r = row(w.customerId, w.currency); r.orders++; r.pending += Math.max(0, balances.get(w.id)!.remaining); }
  for (const p of collections) row(p.customerId, p.money.currency).collected += p.money.amount;
  const cs = Array.from(cm.values()).filter((r) => r.orders || r.collected)
    .sort((a, b) => CUR_ORDER.indexOf(a.currency) - CUR_ORDER.indexOf(b.currency) || b.pending - a.pending || b.collected - a.collected || a.customer.localeCompare(b.customer, "tr"));
  return { vehicles: vs, customers: cs };
}

// ---- SMS (simülasyon; gerçek API yok) ----
/** Servis "Tamamlandı" türüne geçince tetiklenir. Ödeme durumuna bakılmaz. */
const completedListeners = new Set<(workOrderId: string) => void>();
function emitCompleted(id: string) { completedListeners.forEach((l) => l(id)); }
export function onOrderCompleted(fn: (workOrderId: string) => void) { completedListeners.add(fn); return () => { completedListeners.delete(fn); }; }

export const DEFAULT_SMS_TEMPLATE = "Sayın {MusteriAdi}, {Plaka} plakalı aracınızın işlemi tamamlanmıştır. Aracınızı teslim alabilirsiniz.";
export const SMS_VARIABLES = ["{MusteriAdi}", "{Plaka}", "{Marka}", "{Model}", "{ServisBilgisi}", "{IsletmeAdi}", "{IsletmeTelefon}"] as const;

export type SmsSettings = { businessName: string; businessPhone: string; autoSms: boolean; simulateSuccess: boolean; apiKey: string; smsMode: "simulate" | "iletimerkezi"; imKey: string; imHash: string; imSender: string };
const SMS_SETTING_DEFAULTS: SmsSettings = { businessName: "", businessPhone: "", autoSms: true, simulateSuccess: true, apiKey: "", smsMode: "simulate", imKey: "", imHash: "", imSender: "" };
export function getSmsSettings(): SmsSettings {
  const rows = repo.settings.list();
  const g = (k: string) => rows.find((r) => r.key === k)?.value;
  const b = (k: keyof SmsSettings) => { const v = g(k); return v === undefined ? (SMS_SETTING_DEFAULTS[k] as boolean) : v === "1"; };
  return { businessName: g("businessName") ?? "", businessPhone: g("businessPhone") ?? "", autoSms: b("autoSms"), simulateSuccess: b("simulateSuccess"), apiKey: g("apiKey") ?? "", smsMode: g("smsMode") === "iletimerkezi" ? "iletimerkezi" : "simulate", imKey: g("imKey") ?? "", imHash: g("imHash") ?? "", imSender: g("imSender") ?? "" };
}
export function setSmsSetting<K extends keyof SmsSettings>(key: K, value: SmsSettings[K]) {
  const v = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  const row = repo.settings.list({ includeArchived: true }).find((r) => r.key === key);
  if (row) { if (row.value !== v) repo.settings.update(row.id, { value: v }); } else repo.settings.create({ key, value: v });
}
export const maskSecret = (s: string) => (!s ? "" : s.length <= 4 ? "••••" : "•".repeat(Math.min(12, s.length - 4)) + s.slice(-4));

/** Varsayılan şablonu garanti eder ve döndürür. */
export function ensureDefaultTemplate() {
  const all = repo.smsTemplates.list({ includeArchived: true });
  return all.find((t) => t.isDefault) ?? repo.smsTemplates.create({ name: "Servis tamamlandı", body: DEFAULT_SMS_TEMPLATE, isDefault: true });
}
export function resetDefaultTemplate() { const t = ensureDefaultTemplate(); return repo.smsTemplates.update(t.id, { body: DEFAULT_SMS_TEMPLATE }); }
export function archiveTemplate(id: string) {
  if (repo.smsTemplates.get(id)?.isDefault) throw new Error("Varsayılan şablon arşivlenemez.");
  repo.smsTemplates.archive(id);
}

export type SmsVars = Partial<Record<"MusteriAdi" | "Plaka" | "Marka" | "Model" | "ServisBilgisi" | "IsletmeAdi" | "IsletmeTelefon", string>>;
export function fillTemplate(body: string, vars: SmsVars): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (vars as Record<string, string | undefined>)[k] ?? "" : m));
}
export function varsForOrder(workOrderId: string): SmsVars {
  const w = repo.workOrders.get(workOrderId);
  const v = w ? repo.vehicles.get(w.vehicleId) : undefined, c = w ? repo.customers.get(w.customerId) : undefined;
  const s = getSmsSettings();
  const info = w ? [w.orderNo, w.description].filter(Boolean).join(" - ") : "";
  return { MusteriAdi: c ? customerName(c) : "", Plaka: v?.plate ?? "", Marka: v?.brand ?? "", Model: v?.model ?? "", ServisBilgisi: info, IsletmeAdi: s.businessName, IsletmeTelefon: s.businessPhone };
}
export const SAMPLE_VARS: SmsVars = { MusteriAdi: "Mehmet Yılmaz", Plaka: "34ABC123", Marka: "Renault", Model: "Clio", ServisBilgisi: "S-2026-0001 - Periyodik bakım", IsletmeAdi: "Örnek Oto", IsletmeTelefon: "0212 000 00 00" };

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
const TURKISH_EXTRA = "şŞğĞıİç";
export type SmsCharset = "gsm" | "turkish" | "unicode";
/**
 * İleti Merkezi ilk SMS sınırları: İngilizce 155, Türkçe 150, Unicode 65 (belgesine göre).
 * Çok parçalı mesajda parça başına 153 / 148 / 63; bir SMS en fazla 7 parça olabilir (iletiMerkezi belgesi).
 */
export const MAX_SMS_PARTS = 7;
export function smsLength(text: string): { chars: number; parts: number; unicode: boolean; charset: SmsCharset; limit: number; tooLong: boolean } {
  const chars = [...text];
  const has = (ch: string, ...sets: string[]) => sets.some((s) => s.includes(ch));
  const charset: SmsCharset = chars.every((ch) => has(ch, GSM, GSM_EXT)) ? "gsm" : chars.every((ch) => has(ch, GSM, GSM_EXT, TURKISH_EXTRA)) ? "turkish" : "unicode";
  const limit = { gsm: 155, turkish: 150, unicode: 65 }[charset];
  const perPart = { gsm: 153, turkish: 148, unicode: 63 }[charset]; // çok parçalı mesajda parça başına
  const len = charset === "gsm" ? chars.reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0) : chars.length;
  const parts = len === 0 ? 0 : len <= limit ? 1 : Math.max(2, Math.ceil(len / perPart));
  return { chars: len, parts, unicode: charset !== "gsm", charset, limit, tooLong: parts > MAX_SMS_PARTS };
}

/** Simüle gönderim: telefon yoksa veya ayar "başarısız" ise failed olarak kaydeder. */
function simulate(phone: string): { status: SmsLog["status"]; error?: string } {
  if (!phone.replace(/\D/g, "")) return { status: "failed", error: "Müşteri telefonu yok" };
  return getSmsSettings().simulateSuccess ? { status: "sent" } : { status: "failed", error: "Simülasyon: gönderim başarısız" };
}
export function sendSmsForOrder(workOrderId: string, message: string): SmsLog {
  const w = repo.workOrders.get(workOrderId);
  if (!w) throw new Error("Kayıt bulunamadı");
  const c = repo.customers.get(w.customerId), v = repo.vehicles.get(w.vehicleId);
  const phone = c?.phone?.trim() ?? "";
  const log = repo.smsLogs.create({ customerId: w.customerId, workOrderId, customerName: c ? customerName(c) : "", plate: v?.plate ?? "", phone, message, status: "queued", attempts: 0 });
  return deliver(log.id);
}
function deliver(id: string): SmsLog {
  const log = repo.smsLogs.get(id)!;
  const r = simulate(log.phone);
  return repo.smsLogs.update(id, { status: r.status, error: r.error, attempts: (log.attempts ?? 0) + 1, sentAt: r.status === "sent" ? now() : log.sentAt });
}
/** Başarısız kaydı aynı kayıt üzerinde yeniden dener (kayıt silinmez). Telefon güncellendiyse yenisi kullanılır. */
export function retrySms(id: string): SmsLog {
  const log = repo.smsLogs.get(id);
  if (!log) throw new Error("Kayıt bulunamadı");
  if (log.status !== "failed") throw new Error("Yalnızca başarısız mesajlar yeniden gönderilir.");
  const phone = (log.customerId ? repo.customers.get(log.customerId)?.phone?.trim() : undefined) || log.phone;
  repo.smsLogs.update(id, { status: "queued", phone, error: undefined });
  return deliver(id);
}

// ---- Yedekleme için ham tablo erişimi (yalnızca backup.ts kullanır) ----
export const ALL_TABLES: EntityName[] = ["customers", "vehicles", "employees", "workOrders", "workOrderItems", "payments", "expenses", "smsLogs", "smsTemplates", "settings", "auditLogs", "serviceStatuses", "maintenanceReminders"];
export type AllData = { [K in EntityName]: EntityMap[K][] };
/** Arşivliler dahil tüm tablolar. */
export function readAllTables(): AllData {
  const out = {} as Record<EntityName, unknown[]>;
  for (const t of ALL_TABLES) out[t] = read(t);
  return out as AllData;
}
/** Tüm tabloları tek seferde değiştirir. Yazma sırasında hata olursa önceki ham değerler geri yazılır ve hata fırlatılır. */
export function replaceAllTables(data: AllData) {
  const prev = ALL_TABLES.map((t) => [t, localStorage.getItem(PREFIX + t)] as const);
  const prepared = ALL_TABLES.map((t) => [t, JSON.stringify(data[t] ?? [])] as const);
  try {
    for (const [t, v] of prepared) localStorage.setItem(PREFIX + t, v);
  } catch (e) {
    for (const [t, v] of prev) { if (v === null) localStorage.removeItem(PREFIX + t); else localStorage.setItem(PREFIX + t, v); }
    notify();
    throw e;
  }
  notify();
}
export function logAudit(entity: EntityName, entityId: string, action: AuditLog["action"], details?: string) {
  const rows = read("auditLogs");
  rows.push({ id: newId(), createdAt: now(), archived: false, entity, entityId, action, ...(details ? { details } : {}) });
  write("auditLogs", rows);
}
export const backupMeta = {
  getLastBackupAt(): string | null { return isBrowser() ? localStorage.getItem(PREFIX + "lastBackupAt") : null; },
  setLastBackupAt(iso: string) { localStorage.setItem(PREFIX + "lastBackupAt", iso); notify(); },
  getSnapshot(): string | null { return isBrowser() ? localStorage.getItem(PREFIX + "restore-snapshot") : null; },
  /** false dönerse tarayıcı depolaması yetmedi. */
  setSnapshot(text: string): boolean { try { localStorage.setItem(PREFIX + "restore-snapshot", text); return true; } catch { return false; } },
};

// ---- Kalıcı silme (zincirleme) + son silmeyi geri alma ----
export type DeleteCounts = { customers: number; vehicles: number; workOrders: number; workOrderItems: number; payments: number; smsLogs: number; maintenanceReminders: number };
type DeleteSet = { customers: Customer[]; vehicles: Vehicle[]; workOrders: WorkOrder[]; workOrderItems: WorkOrderItem[]; payments: Payment[]; smsLogs: SmsLog[]; maintenanceReminders: MaintenanceReminder[] };
const DELETE_TABLES = ["customers", "vehicles", "workOrders", "workOrderItems", "payments", "smsLogs", "maintenanceReminders"] as const;
const LAST_DELETE_KEY = PREFIX + "last-delete";

function collectDelete(kind: "customer" | "vehicle" | "workOrder", id: string): DeleteSet {
  const customers = kind === "customer" ? read("customers").filter((c) => c.id === id) : [];
  const vehicles = read("vehicles").filter((v) => (kind === "customer" ? v.customerId === id : kind === "vehicle" && v.id === id));
  const vIds = new Set(vehicles.map((v) => v.id));
  const workOrders = read("workOrders").filter((w) =>
    kind === "workOrder" ? w.id === id : kind === "vehicle" ? vIds.has(w.vehicleId) : w.customerId === id || vIds.has(w.vehicleId));
  const wIds = new Set(workOrders.map((w) => w.id));
  const workOrderItems = read("workOrderItems").filter((i) => wIds.has(i.workOrderId));
  const payments = read("payments").filter((p) => wIds.has(p.workOrderId) || (kind === "customer" && p.customerId === id));
  const smsLogs = read("smsLogs").filter((s) => (s.workOrderId && wIds.has(s.workOrderId)) || (kind === "customer" && s.customerId === id));
  const maintenanceReminders = read("maintenanceReminders").filter((m) => vIds.has(m.vehicleId));
  return { customers, vehicles, workOrders, workOrderItems, payments, smsLogs, maintenanceReminders };
}
const countSet = (s: DeleteSet): DeleteCounts => Object.fromEntries(DELETE_TABLES.map((t) => [t, s[t].length])) as DeleteCounts;
export function describeDeleteCounts(c: DeleteCounts): string {
  const parts: [number, string][] = [[c.customers, "müşteri"], [c.vehicles, "araç"], [c.workOrders, "servis"], [c.workOrderItems, "kalem"], [c.payments, "ödeme"], [c.smsLogs, "SMS kaydı"], [c.maintenanceReminders, "bakım hatırlatıcı"]];
  return parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(", ") || "—";
}
export const previewDeleteCustomer = (id: string) => countSet(collectDelete("customer", id));
export const previewDeleteVehicle = (id: string) => countSet(collectDelete("vehicle", id));
export const previewDeleteWorkOrder = (id: string) => countSet(collectDelete("workOrder", id));

function performDelete(kind: "customer" | "vehicle" | "workOrder", id: string, entity: EntityName, title: string): DeleteCounts {
  const set = collectDelete(kind, id);
  const main = kind === "customer" ? set.customers[0] : kind === "vehicle" ? set.vehicles[0] : set.workOrders[0];
  if (!main) throw new Error("Kayıt bulunamadı");
  const counts = countSet(set);
  // Güvenlik kopyası (yalnızca son silme tutulur).
  localStorage.setItem(LAST_DELETE_KEY, JSON.stringify({ deletedAt: now(), entity, entityId: id, title, rows: set }));
  for (const t of DELETE_TABLES) {
    const ids = new Set(set[t].map((r) => r.id));
    if (ids.size) localStorage.setItem(PREFIX + t, JSON.stringify((read(t) as BaseRecord[]).filter((r) => !ids.has(r.id))));
  }
  logAudit(entity, id, "delete", `${title} silindi: ${describeDeleteCounts(counts)}`);
  return counts;
}
export const deleteCustomer = (id: string) => { const c = repo.customers.get(id); return performDelete("customer", id, "customers", `Müşteri ${c ? customerName(c) : ""}`.trim()); };
export const deleteVehicle = (id: string) => { const v = repo.vehicles.get(id); return performDelete("vehicle", id, "vehicles", `Araç ${v?.plate ?? ""}`.trim()); };
export const deleteWorkOrder = (id: string) => { const w = repo.workOrders.get(id); return performDelete("workOrder", id, "workOrders", `Servis ${w?.orderNo ?? ""}`.trim()); };

export const hasLastDelete = () => isBrowser() && !!localStorage.getItem(LAST_DELETE_KEY);
/** Son silinen kayıtları (ve bağlılarını) geri getirir. */
export function undoLastDelete(): DeleteCounts {
  const raw = localStorage.getItem(LAST_DELETE_KEY);
  if (!raw) throw new Error("Geri alınacak bir silme bulunamadı.");
  const snap = JSON.parse(raw) as { entity: EntityName; entityId: string; title: string; rows: DeleteSet };
  for (const t of DELETE_TABLES) {
    const cur = read(t) as BaseRecord[];
    const have = new Set(cur.map((r) => r.id));
    const add = (snap.rows[t] ?? []).filter((r) => !have.has(r.id));
    if (add.length) localStorage.setItem(PREFIX + t, JSON.stringify([...cur, ...add]));
  }
  localStorage.removeItem(LAST_DELETE_KEY);
  const counts = countSet(snap.rows);
  logAudit(snap.entity, snap.entityId, "restore", `${snap.title} silmesi geri alındı: ${describeDeleteCounts(counts)}`);
  return counts;
}

// ---- Çalışan / servis durumu silme kuralları ----
/** Çalışan herhangi bir serviste (arşivliler dahil) kullanılmış mı? */
export const employeeUsed = (id: string) => repo.workOrders.list({ includeArchived: true }).some((w) => w.employeeId === id);
export function deleteEmployee(id: string) {
  if (!repo.employees.get(id)) throw new Error("Çalışan bulunamadı.");
  if (employeeUsed(id)) throw new Error("Bu çalışan servis kayıtlarında kullanılmış. Silmek yerine arşivleyin.");
  repo.employees.remove(id);
}
export const statusUsed = (id: string) => repo.workOrders.list({ includeArchived: true }).some((w) => w.statusId === id);
export function deleteStatus(id: string) {
  const s = repo.serviceStatuses.get(id);
  if (!s) throw new Error("Durum bulunamadı.");
  if (s.builtin) throw new Error("Temel durumlar silinemez.");
  if (statusUsed(id)) throw new Error("Bu durumda servis kayıtları var. Silmek yerine arşivleyin.");
  repo.serviceStatuses.remove(id);
}

// ---- Periyodik bakım hatırlatıcısı ----
export const REMINDER_KINDS = ["Yağ bakımı", "Filtre değişimi", "Fren bakımı", "Lastik", "Periyodik bakım", "Muayene", "Sigorta / kasko", "Diğer"];
export type ReminderState = "overdue" | "soon" | "ok";
export const REMINDER_STATE_LABEL: Record<ReminderState, string> = { overdue: "Gecikti", soon: "Yaklaşıyor", ok: "Zamanı var" };

const parseDay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y!, (m ?? 1) - 1, d ?? 1); };
export const toDayString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Ay sonu taşmasını önler: 31 Ocak + 1 ay = 28/29 Şubat. */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last));
  return r;
}
export function reminderStatus(m: Pick<MaintenanceReminder, "lastDoneAt" | "intervalMonths" | "remindDaysBefore">, today = new Date()): { state: ReminderState; dueAt: Date; daysLeft: number } {
  const dueAt = addMonths(parseDay(m.lastDoneAt), m.intervalMonths);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((dueAt.getTime() - t0.getTime()) / 86_400_000);
  const state: ReminderState = daysLeft < 0 ? "overdue" : daysLeft <= m.remindDaysBefore ? "soon" : "ok";
  return { state, dueAt, daysLeft };
}
export type ReminderInput = { vehicleId: string; kind: string; lastDoneAt: string; intervalMonths: number; remindDaysBefore: number; note?: string | undefined };
export function createReminder(input: ReminderInput): MaintenanceReminder {
  if (!repo.vehicles.get(input.vehicleId)) throw new Error("Araç bulunamadı.");
  if (!input.kind.trim()) throw new Error("Bakım türü boş olamaz.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lastDoneAt) || Number.isNaN(parseDay(input.lastDoneAt).getTime())) throw new Error("Son bakım tarihi geçersiz.");
  if (!Number.isInteger(input.intervalMonths) || input.intervalMonths < 1 || input.intervalMonths > 120) throw new Error("Aralık 1-120 ay arasında olmalı.");
  if (!Number.isInteger(input.remindDaysBefore) || input.remindDaysBefore < 0 || input.remindDaysBefore > 365) throw new Error("Hatırlatma günü 0-365 arasında olmalı.");
  return repo.maintenanceReminders.create({ vehicleId: input.vehicleId, kind: input.kind.trim(), lastDoneAt: input.lastDoneAt, intervalMonths: input.intervalMonths, remindDaysBefore: input.remindDaysBefore, note: input.note?.trim() || undefined });
}
/** "Bakım yapıldı": son tarih bugün olur, bir sonraki bakım aralık kadar ileri kayar. */
export function renewReminder(id: string, doneAt = toDayString(new Date())): MaintenanceReminder {
  return repo.maintenanceReminders.update(id, { lastDoneAt: doneAt });
}
export const remindersOfVehicle = (vehicleId: string) =>
  repo.maintenanceReminders.list().filter((m) => m.vehicleId === vehicleId)
    .sort((a, b) => reminderStatus(a).dueAt.getTime() - reminderStatus(b).dueAt.getTime());
export type UpcomingReminder = { m: MaintenanceReminder; vehicle: Vehicle; customer: Customer; state: ReminderState; dueAt: Date; daysLeft: number };
/** Zamanı yaklaşan veya geçen bakımlar (en acil önce). Arşivli araç/müşteri hariç. */
export function upcomingReminders(today = new Date()): UpcomingReminder[] {
  const out: UpcomingReminder[] = [];
  for (const m of repo.maintenanceReminders.list()) {
    const vehicle = repo.vehicles.get(m.vehicleId); const customer = vehicle && repo.customers.get(vehicle.customerId);
    if (!vehicle || vehicle.archived || !customer || customer.archived) continue;
    const s = reminderStatus(m, today);
    if (s.state !== "ok") out.push({ m, vehicle, customer, ...s });
  }
  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

// ---- Saklama alanı ve yedek yaşı ----
const STORAGE_LIMIT_CHARS = 5_000_000; // tarayıcı sınırı cihaza göre değişir; ihtiyatlı varsayım
export function storageUsage(): { usedChars: number; limitChars: number; ratio: number } {
  let used = 0;
  if (isBrowser()) for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(PREFIX)) used += k.length + (localStorage.getItem(k)?.length ?? 0); }
  return { usedChars: used, limitChars: STORAGE_LIMIT_CHARS, ratio: used / STORAGE_LIMIT_CHARS };
}
/** Son yedekten bu yana geçen gün; hiç yedek alınmadıysa null. */
export function daysSinceBackup(today = new Date()): number | null {
  const iso = backupMeta.getLastBackupAt();
  if (!iso) return null;
  return Math.max(0, Math.floor((today.getTime() - new Date(iso).getTime()) / 86_400_000));
}
