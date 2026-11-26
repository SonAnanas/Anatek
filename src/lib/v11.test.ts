import { beforeEach, describe, expect, it } from "vitest";
import {
  addMonths, createReminder, customerBalance, deleteCustomer, deleteEmployee, deleteStatus, deleteVehicle, ensureServiceDefaults, listStatuses,
  orderBalance, periodSummary, recordPayment, remindersOfVehicle, renewReminder, reminderStatus, repo, saveWorkOrder, serviceIndicators,
  setOrderStatus, toDayString, undoLastDelete, upcomingReminders, addStatus, daysSinceBackup, backupMeta, storageUsage, readAllTables,
} from "./repository";
import { checkRelations } from "./backup";
import { periodRange } from "./periods";

beforeEach(() => localStorage.clear());

const statusId = (label: string) => listStatuses(true).find((s) => s.label === label)!.id;

function order(amount = 100000, currency: "TRY" | "USD" = "TRY") {
  ensureServiceDefaults();
  const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone: "05321112233" });
  const v = repo.vehicles.create({ customerId: c.id, plate: "34ABC123", brand: "Fiat", model: "Egea", type: "Otomobil" });
  const w = saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: statusId("Yeni"), enteredAt: new Date().toISOString(), currency }, [{ name: "İşçilik", kind: "labor", amount }]);
  return { c, v, w };
}

describe("iptal edilen servis", () => {
  it("ciroya, bekleyen borca ve sayaca girmez; iptalden dönünce geri girer", () => {
    const { c, w } = order(100000);
    const today = periodRange("today");
    expect(periodSummary(today)[0]).toMatchObject({ revenue: 100000, pending: 100000 });
    expect(serviceIndicators().awaitingPayment).toBe(1);
    setOrderStatus(w.id, statusId("İptal"));
    expect(periodSummary(today)[0]).toMatchObject({ revenue: 0, pending: 0 });
    expect(serviceIndicators().awaitingPayment).toBe(0);
    expect(orderBalance(w.id)).toMatchObject({ cancelled: true, state: "cancelled", remaining: 0 });
    expect(customerBalance(c.id)).toEqual([]);
    setOrderStatus(w.id, statusId("Yeni"));
    expect(periodSummary(today)[0]).toMatchObject({ revenue: 100000, pending: 100000 });
  });
  it("iptal servise ödeme girilemez", () => {
    const { w } = order();
    setOrderStatus(w.id, statusId("İptal"));
    expect(() => recordPayment({ workOrderId: w.id, money: { amount: 100, currency: "TRY" }, method: "cash", paidAt: "2026-03-01" })).toThrow(/İptal/);
  });
  it("iptal öncesi alınan tahsilat kaybolmaz (paid korunur, tahsilat gelirde kalır)", () => {
    const { w } = order(100000);
    recordPayment({ workOrderId: w.id, money: { amount: 40000, currency: "TRY" }, method: "cash", paidAt: toDayString(new Date()) + "T10:00:00" });
    setOrderStatus(w.id, statusId("İptal"));
    const b = orderBalance(w.id)!;
    expect(b.paid).toBe(40000);
    expect(b.remaining).toBe(0);
    expect(periodSummary(periodRange("today"))[0]!.collected).toBe(40000);
  });
});

describe("çalışan ve durum silme", () => {
  it("kullanılmamış çalışan silinir, kullanılmış çalışan silinmez", () => {
    const free = repo.employees.create({ name: "Boşta" });
    deleteEmployee(free.id);
    expect(repo.employees.get(free.id)).toBeUndefined();
    const { w } = order();
    const used = repo.employees.create({ name: "Usta Ahmet" });
    repo.workOrders.update(w.id, { employeeId: used.id });
    expect(() => deleteEmployee(used.id)).toThrow(/arşivleyin/);
    expect(repo.employees.get(used.id)).toBeDefined();
  });
  it("temel durum silinemez; kullanılan özel durum silinemez; boş özel durum silinir", () => {
    ensureServiceDefaults();
    expect(() => deleteStatus(statusId("Yeni"))).toThrow(/Temel/);
    const custom = addStatus("Parça bekleniyor");
    const { w } = order();
    repo.workOrders.update(w.id, { statusId: custom.id });
    expect(() => deleteStatus(custom.id)).toThrow(/arşivleyin/);
    repo.workOrders.update(w.id, { statusId: statusId("Yeni") });
    deleteStatus(custom.id);
    expect(repo.serviceStatuses.get(custom.id)).toBeUndefined();
  });
});

describe("bakım hatırlatıcı", () => {
  it("ay sonu taşmaz: 31 Ocak + 1 ay = 28 Şubat", () => {
    expect(toDayString(addMonths(new Date(2027, 0, 31), 1))).toBe("2027-02-28");
    expect(toDayString(addMonths(new Date(2028, 0, 31), 1))).toBe("2028-02-29");
    expect(toDayString(addMonths(new Date(2026, 10, 20), 12))).toBe("2027-11-20");
  });
  it("durum: zamanı var / yaklaşıyor / gecikti", () => {
    const m = { lastDoneAt: "2026-01-15", intervalMonths: 12, remindDaysBefore: 7 };
    expect(reminderStatus(m, new Date(2026, 5, 1)).state).toBe("ok");
    expect(reminderStatus(m, new Date(2027, 0, 8)).state).toBe("soon");   // 7 gün kala
    expect(reminderStatus(m, new Date(2027, 0, 7)).state).toBe("ok");     // 8 gün kala
    expect(reminderStatus(m, new Date(2027, 0, 15)).state).toBe("soon");  // son gün
    expect(reminderStatus(m, new Date(2027, 0, 16)).state).toBe("overdue");
    expect(reminderStatus(m, new Date(2027, 0, 16)).daysLeft).toBe(-1);
  });
  it("doğrulama: geçersiz tarih, aralık ve olmayan araç reddedilir", () => {
    const { v } = order();
    const base = { vehicleId: v.id, kind: "Yağ bakımı", lastDoneAt: "2026-01-01", intervalMonths: 12, remindDaysBefore: 7 };
    expect(() => createReminder({ ...base, lastDoneAt: "01.01.2026" })).toThrow(/tarih/);
    expect(() => createReminder({ ...base, intervalMonths: 0 })).toThrow(/Aralık/);
    expect(() => createReminder({ ...base, remindDaysBefore: -1 })).toThrow(/Hatırlatma/);
    expect(() => createReminder({ ...base, kind: "  " })).toThrow(/türü/);
    expect(() => createReminder({ ...base, vehicleId: "yok" })).toThrow(/Araç/);
  });
  it("panelde yalnızca yaklaşan/geciken görünür; yenilenince listeden çıkar", () => {
    const { v } = order();
    const old = createReminder({ vehicleId: v.id, kind: "Yağ bakımı", lastDoneAt: "2025-01-01", intervalMonths: 12, remindDaysBefore: 7 });
    createReminder({ vehicleId: v.id, kind: "Muayene", lastDoneAt: toDayString(new Date()), intervalMonths: 24, remindDaysBefore: 30 });
    const up = upcomingReminders();
    expect(up.map((u) => u.m.kind)).toEqual(["Yağ bakımı"]);
    expect(up[0]!.state).toBe("overdue");
    expect(up[0]!.customer.phone).toBe("05321112233");
    renewReminder(old.id);
    expect(upcomingReminders()).toEqual([]);
    expect(remindersOfVehicle(v.id)).toHaveLength(2);
  });
  it("arşivli araç veya müşterinin hatırlatıcısı panelde görünmez", () => {
    const { v } = order();
    createReminder({ vehicleId: v.id, kind: "Yağ bakımı", lastDoneAt: "2020-01-01", intervalMonths: 12, remindDaysBefore: 7 });
    expect(upcomingReminders()).toHaveLength(1);
    repo.vehicles.archive(v.id);
    expect(upcomingReminders()).toHaveLength(0);
  });
  it("araç silinince hatırlatıcılar da silinir, geri alınca döner; yedek ilişki kontrolü kopuğu yakalar", () => {
    const { v, c } = order();
    createReminder({ vehicleId: v.id, kind: "Yağ bakımı", lastDoneAt: "2026-01-01", intervalMonths: 12, remindDaysBefore: 7 });
    deleteVehicle(v.id);
    expect(repo.maintenanceReminders.list()).toHaveLength(0);
    undoLastDelete();
    expect(repo.maintenanceReminders.list()).toHaveLength(1);
    deleteCustomer(c.id);
    expect(repo.maintenanceReminders.list()).toHaveLength(0);
    undoLastDelete();
    const d = readAllTables();
    expect(checkRelations(d)).toEqual([]);
    expect(checkRelations({ ...d, vehicles: [] })).toEqual(expect.arrayContaining([expect.stringContaining("bağlı araç bulunamadı")]));
  });
});

describe("yedek yaşı ve saklama alanı", () => {
  it("yedek yaşı gün olarak hesaplanır; hiç yedek yoksa null", () => {
    expect(daysSinceBackup()).toBeNull();
    backupMeta.setLastBackupAt(new Date(Date.now() - 9 * 86_400_000).toISOString());
    expect(daysSinceBackup()).toBe(9);
  });
  it("kullanılan alan veri eklendikçe artar", () => {
    const a = storageUsage().usedChars;
    for (let i = 0; i < 20; i++) repo.customers.create({ firstName: "Müşteri" + i, lastName: "Deneme", phone: "0532000000" + i });
    expect(storageUsage().usedChars).toBeGreaterThan(a);
    expect(storageUsage().ratio).toBeLessThan(1);
  });
});
