import { beforeEach, describe, expect, it } from "vitest";
import {
  createReminder, deleteCustomer, ensureSeeded, ensureServiceDefaults, listStatuses, orderBalance, periodSummary, readAllTables, recordPayment,
  repo, saveWorkOrder, setOrderStatus, undoLastDelete, type AllData,
} from "./repository";
import { createBackup, prepareRestore } from "./backup";
import { checkIntegrity, checkRelations, runHealthCheck, getLastHealth } from "./integrity";
import { periodRange } from "./periods";

beforeEach(() => localStorage.clear());
const sid = (label: string) => listStatuses(true).find((s) => s.label === label)!.id;
const today = () => new Date().toISOString();

/** Tutarlı örnek veri: müşteri, araç, 1.000 TL'lik servis, 400 TL kısmi ödeme, bakım hatırlatıcı. */
function valid() {
  ensureServiceDefaults();
  const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone: "0532 111 22 33" });
  const v = repo.vehicles.create({ customerId: c.id, plate: "34ABC123", brand: "Fiat", model: "Egea", type: "Otomobil" });
  const w = saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: sid("Yeni"), enteredAt: today(), currency: "TRY" }, [{ name: "İşçilik", kind: "labor", amount: 100000 }]);
  const p = recordPayment({ workOrderId: w.id, money: { amount: 40000, currency: "TRY" }, method: "cash", paidAt: today() });
  createReminder({ vehicleId: v.id, kind: "Yağ bakımı", lastDoneAt: "2026-01-01", intervalMonths: 12, remindDaysBefore: 7 });
  return { c, v, w, p };
}
const clone = (): AllData => JSON.parse(JSON.stringify(readAllTables()));

describe("kayıt eklerken doğrulama", () => {
  it("1) müşterisi olmayan araç oluşturulamaz", () => {
    const { v } = valid();
    expect(() => repo.vehicles.create({ customerId: "yok", plate: "06ZZZ99", brand: v.brand, model: v.model, type: v.type })).toThrow(/müşteri/);
    expect(repo.vehicles.list()).toHaveLength(1);
  });
  it("2) aynı plaka tekrar kaydedilemez (boşluk/büyük-küçük harf fark etmez); arşivlenmişin plakası yeniden kullanılabilir", () => {
    const { c, v } = valid();
    const mk = (plate: string) => repo.vehicles.create({ customerId: c.id, plate, brand: "A", model: "B", type: "Otomobil" });
    expect(() => mk("34 abc 123")).toThrow(/zaten aktif/);
    const other = mk("06XYZ77");
    expect(() => repo.vehicles.update(other.id, { plate: "34ABC123" })).toThrow(/zaten aktif/);
    repo.vehicles.archive(v.id);
    const reuse = mk("34ABC123");
    expect(reuse.plate).toBe("34ABC123");
    expect(() => repo.vehicles.restore(v.id)).toThrow(/zaten aktif/);
  });
  it("3) olmayan servise ödeme bağlanamaz", () => {
    valid();
    expect(() => recordPayment({ workOrderId: "yok", money: { amount: 100, currency: "TRY" }, method: "cash", paidAt: today() })).toThrow(/bulunamadı/);
    expect(() => repo.payments.create({ customerId: "x", workOrderId: "yok", money: { amount: 100, currency: "TRY" }, method: "cash", paidAt: today(), status: "active" })).toThrow(/geçerli bir servis/);
  });
  it("4) kalem olmayan servise bağlanamaz; aynı servis numarası ikinci kez verilemez", () => {
    const { w, c, v } = valid();
    expect(() => repo.workOrderItems.create({ workOrderId: "yok", name: "x", kind: "labor", amount: { amount: 1, currency: "TRY" } })).toThrow(/geçerli bir servis/);
    expect(() => repo.workOrders.create({ ...w, orderNo: w.orderNo } as never)).toThrow(/zaten kullanılıyor/);
    expect(() => repo.workOrders.create({ customerId: c.id, vehicleId: "yok", statusId: sid("Yeni"), enteredAt: today(), currency: "TRY", orderNo: "X-1" } as never)).toThrow(/araç/);
    void v;
  });
  it("5) aynı ödeme çift tıklamayla ikinci kez girilemez; farklı tutar girilebilir", () => {
    const { w } = valid();
    expect(() => recordPayment({ workOrderId: w.id, money: { amount: 40000, currency: "TRY" }, method: "cash", paidAt: today() })).toThrow(/Çift tıklama/);
    expect(() => recordPayment({ workOrderId: w.id, money: { amount: 10000, currency: "TRY" }, method: "cash", paidAt: today() })).not.toThrow();
  });
});

describe("veri sağlığı kontrolü", () => {
  it("8) geçerli veri hiçbir uyarı vermez (elle girilen ve örnek veri)", () => {
    valid();
    expect(checkIntegrity().issues).toEqual([]);
    localStorage.clear();
    ensureSeeded();
    expect(checkIntegrity().issues).toEqual([]);
  });
  it("1) sahipsiz araç, servis, kalem, ödeme, bakım tespit edilir ve ilgili kayda bağlantı verilir", () => {
    valid();
    const d = clone();
    d.vehicles.push({ ...d.vehicles[0]!, id: "v-orphan", plate: "06ORF11", customerId: "yok" });
    d.workOrderItems.push({ ...d.workOrderItems[0]!, id: "i-orphan", workOrderId: "yok" });
    d.payments.push({ ...d.payments[0]!, id: "p-orphan", workOrderId: "yok" });
    d.maintenanceReminders.push({ ...d.maintenanceReminders[0]!, id: "m-orphan", vehicleId: "yok" });
    d.workOrders.push({ ...d.workOrders[0]!, id: "w-orphan", orderNo: "S-9", vehicleId: "yok", statusId: "yok-durum" });
    const r = checkIntegrity(d);
    expect(r.byCategory.relation).toBeGreaterThanOrEqual(6);
    const msgs = r.issues.map((i) => i.message).join("\n");
    for (const part of ["bağlı müşteri bulunamadı", "Kalem", "Ödeme p-orphan", "Bakım hatırlatıcı", "bağlı araç bulunamadı", "durum kaydı bulunamadı"]) expect(msgs).toContain(part);
    expect(r.issues.some((i) => i.links.length > 0)).toBe(true);
    // yedek doğrulamasındaki eski sıkılık: durum kaydı eksikliği yedeği engellemez, temel bağlar engeller
    expect(checkRelations(d).join("\n")).not.toContain("durum kaydı");
    expect(checkRelations(d).length).toBeGreaterThanOrEqual(5);
  });
  it("2) veride yinelenen plaka ve servis numarası hata; aynı telefon/ad uyarı olarak bildirilir, hiçbiri birleştirilmez", () => {
    const { c } = valid();
    repo.customers.create({ firstName: "Veli", lastName: "Demir", phone: "+90 532 1112233" });          // aynı telefon
    repo.customers.create({ firstName: "ali", lastName: "KAYA", phone: "0555 000 00 00" });              // aynı ad (farklı telefon)
    const d = clone();
    d.vehicles.push({ ...d.vehicles[0]!, id: "v-dup" });
    d.workOrders.push({ ...d.workOrders[0]!, id: "w-dup" });
    const r = checkIntegrity(d);
    const dup = r.issues.filter((i) => i.category === "duplicate");
    expect(dup.some((i) => i.severity === "error" && i.message.includes("Aynı plaka"))).toBe(true);
    expect(dup.some((i) => i.severity === "error" && i.message.includes("Aynı servis numarası"))).toBe(true);
    expect(dup.some((i) => i.severity === "warning" && i.message.includes("telefon"))).toBe(true);
    expect(dup.some((i) => i.severity === "warning" && i.message.includes("ad-soyad"))).toBe(true);
    expect(repo.customers.list()).toHaveLength(3); // otomatik birleştirme yok
    void c;
  });
  it("5) kısmi ödeme, iade, fazla ödeme ve iptal edilen serviste tahsilat", () => {
    const { w, p } = valid();
    expect(orderBalance(w.id)).toMatchObject({ paid: 40000, remaining: 60000 });
    recordPayment({ workOrderId: w.id, money: { amount: 60000, currency: "TRY" }, method: "transfer", paidAt: today() });
    expect(orderBalance(w.id)).toMatchObject({ paid: 100000, remaining: 0, state: "paid" });
    repo.payments.update(p.id, { status: "refunded" });                       // iade
    expect(orderBalance(w.id)).toMatchObject({ paid: 60000, remaining: 40000, state: "partial" });
    expect(checkIntegrity().issues).toEqual([]);                              // iade doğru hesaba katılır, sorun yok
    const d = clone();                                                         // ham veride fazla ödeme
    d.payments.push({ ...d.payments[0]!, id: "p-extra", status: "active", money: { amount: 90000, currency: "TRY" } });
    expect(checkIntegrity(d).issues.some((i) => i.category === "financial" && i.message.includes("fazla ödeme"))).toBe(true);
    const bad = clone();                                                       // negatif tutar ve para birimi uyuşmazlığı
    bad.payments[0]!.money = { amount: -5, currency: "TRY" };
    bad.payments[1]!.money = { amount: 100, currency: "USD" };
    const msgs = checkIntegrity(bad).issues.map((i) => i.message).join("\n");
    expect(msgs).toContain("negatif veya geçersiz");
    expect(msgs).toContain("para birimi servisle aynı değil");
    setOrderStatus(w.id, sid("İptal"));                                        // iptal + tahsilat kaydı: uyarı
    const c = checkIntegrity().issues.filter((i) => i.category === "financial");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ severity: "warning" });
    expect(c[0]!.message).toContain("iade gerekebilir");
  });
  it("4) kalem başka servise taşınırsa fazla ödeme olarak yakalanır", () => {
    const { w, c, v } = valid();
    const w2 = saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: sid("Yeni"), enteredAt: today(), currency: "TRY" }, [{ name: "Fren", kind: "part", amount: 5000 }]);
    const d = clone();
    d.workOrderItems.find((i) => i.workOrderId === w.id)!.workOrderId = w2.id;
    expect(checkIntegrity(d).issues.some((i) => i.message.includes("fazla ödeme"))).toBe(true);
  });
  it("6) silme ve geri alma sonrası ilişki hatası oluşmaz", () => {
    const { c } = valid();
    deleteCustomer(c.id);
    expect(checkIntegrity().issues).toEqual([]);
    expect(repo.vehicles.list()).toHaveLength(0);
    undoLastDelete();
    expect(checkIntegrity().issues).toEqual([]);
    expect(repo.vehicles.list()).toHaveLength(1);
  });
  it("rapor ile ödeme kayıtları tutarlı: toplam tahsilat = aktif ödemelerin toplamı", () => {
    const { w } = valid();
    recordPayment({ workOrderId: w.id, money: { amount: 12345, currency: "TRY" }, method: "cash", paidAt: today() });
    const raw = readAllTables().payments.filter((p) => p.status === "active" && p.money.currency === "TRY").reduce((a, p) => a + p.money.amount, 0);
    const row = periodSummary(periodRange("custom", new Date(), { from: "2000-01-01", to: "2100-12-31" })).find((r) => r.currency === "TRY")!;
    expect(row.collected).toBe(raw);
  });
  it("son kontrol tarihi ve sayıları saklanır; kayıtlara dokunulmaz", () => {
    valid();
    const before = JSON.stringify(readAllTables());
    expect(getLastHealth()).toBeNull();
    const r = runHealthCheck();
    expect(getLastHealth()).toMatchObject({ errors: r.errors, warnings: r.warnings });
    expect(JSON.stringify(readAllTables())).toBe(before);
  });
});

describe("bozuk yedek geri yüklenemez", () => {
  it("7) kopuk kayıt veya eksik alan içeren yedek reddedilir; geçerli yedek kabul edilir", async () => {
    valid();
    const good = await createBackup("", readAllTables());
    await expect(prepareRestore(good)).resolves.toBeTruthy();
    const orphan = clone(); orphan.vehicles[0]!.customerId = "yok";
    await expect(prepareRestore(await createBackup("", orphan))).rejects.toThrow(/bağlı müşteri bulunamadı/);
    const noPhone = clone(); delete (noPhone.customers[0] as unknown as Record<string, unknown>)["phone"];
    await expect(prepareRestore(await createBackup("", noPhone))).rejects.toThrow(/telefon/);
    const dupId = clone(); dupId.customers.push({ ...dupId.customers[0]! });
    await expect(prepareRestore(await createBackup("", dupId))).rejects.toThrow(/aynı kimlik/);
  });
});
