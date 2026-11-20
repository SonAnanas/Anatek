import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "./repository";
import { addMoney, money, totalsByCurrency } from "./money";

beforeEach(() => localStorage.clear());

describe("kurallar", () => {
  it("arşivleme kaydı silmez", () => {
    const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone: "05321112233" });
    repo.customers.archive(c.id);
    expect(repo.customers.list()).toHaveLength(0);
    expect(repo.customers.list({ includeArchived: true })).toHaveLength(1);
  });
  it("her kayıtta id ve createdAt var", () => {
    const c = repo.customers.create({ firstName: "Ayşe", lastName: "Demir", phone: "05321112234" });
    expect(c.id).toBeTruthy();
    expect(c.createdAt).toBeTruthy();
  });
  it("farklı para birimleri toplanamaz", () => {
    expect(() => addMoney(money(100, "TRY"), money(100, "USD"))).toThrow();
    expect(totalsByCurrency([money(100, "TRY"), money(50, "USD"), money(25, "TRY")])).toEqual({ TRY: 125, USD: 50 });
  });
  it("kuruş tam sayı olmalı", () => {
    expect(() => money(10.5, "TRY")).toThrow();
  });
});

import { normalizePlate } from "./normalize";
describe("plaka", () => {
  it("normalize edilir", () => expect(normalizePlate("34 abc 123")).toBe("34ABC123"));
});

import { listStatuses, ensureServiceDefaults, nextOrderNo, saveWorkOrder, isActiveOrder, auditOf, setOrderStatus } from "./repository";
describe("servis", () => {
  const setup = () => {
    ensureServiceDefaults();
    const c = repo.customers.create({ firstName: "A", lastName: "B", phone: "05320000000" });
    const v = repo.vehicles.create({ customerId: c.id, plate: "34ABC1", brand: "X", model: "Y", type: "Otomobil" });
    const st = (l: string) => listStatuses().find((s) => s.label === l)!.id;
    const make = () => saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: st("Yeni"), enteredAt: "2026-03-01T00:00:00.000Z", currency: "TRY" },
      [{ name: "Yağ", kind: "part", amount: 50000 }]);
    return { st, make };
  };
  it("iş emri no yıl bazında artar", () => {
    const { make } = setup();
    expect(make().orderNo).toBe("IE-2026-0001");
    expect(make().orderNo).toBe("IE-2026-0002");
    expect(nextOrderNo(new Date("2027-01-02"))).toBe("IE-2027-0001");
  });
  it("tamamlandı: tarih kaydedilir, aktiften çıkar", () => {
    const { make, st } = setup();
    const w = setOrderStatus(make().id, st("Tamamlandı"));
    expect(w.completedAt).toBeTruthy();
    expect(isActiveOrder(w)).toBe(false);
  });
  it("tamamlanmış servisin kalemi silinemez ve değişiklik loglanır", () => {
    const { make, st } = setup();
    const w = make();
    setOrderStatus(w.id, st("Tamamlandı"));
    expect(() => saveWorkOrder({ customerId: w.customerId, vehicleId: w.vehicleId, statusId: st("Tamamlandı"), enteredAt: w.enteredAt, currency: "TRY" }, [], w.id)).toThrow();
    expect(repo.workOrderItems.list()).toHaveLength(1);
    expect(auditOf(w.id).some((a) => a.action === "update" && a.details?.includes("statusId"))).toBe(true);
  });
});

import { customerBalance, markPayment, orderBalance, recordPayment } from "./repository";
describe("ödeme takibi", () => {
  // 500,00 TRY'lik bir servis
  const setup = () => {
    ensureServiceDefaults();
    const c = repo.customers.create({ firstName: "Ödeme", lastName: "Test", phone: "05329999999" });
    const v = repo.vehicles.create({ customerId: c.id, plate: "34PAY1", brand: "X", model: "Y", type: "Otomobil" });
    const st = listStatuses().find((s) => s.label === "Yeni")!.id;
    const w = saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: st, enteredAt: "2026-03-01T00:00:00.000Z", currency: "TRY" },
      [{ name: "Yağ", kind: "part", amount: 30000 }, { name: "İşçilik", kind: "labor", amount: 20000 }]);
    const pay = (amount: number, currency: "TRY" | "USD" | "EUR" = "TRY") =>
      recordPayment({ workOrderId: w.id, money: { amount, currency }, method: "cash", paidAt: "2026-03-02T00:00:00.000Z" });
    return { c, w, pay };
  };

  it("ödeme yokken durum Bekliyor, kalan = toplam", () => {
    const { w } = setup();
    expect(orderBalance(w.id)).toMatchObject({ total: 50000, paid: 0, remaining: 50000, state: "unpaid" });
  });
  it("kısmi ödeme: 200 TL ödenince kalan 300 TL, Kısmi ödeme", () => {
    const { w, pay } = setup();
    const p = pay(20000);
    expect(p.status).toBe("active");
    expect(orderBalance(w.id)).toMatchObject({ paid: 20000, remaining: 30000, state: "partial", lastPaidAt: "2026-03-02T00:00:00.000Z" });
  });
  it("tam ödeme: birden fazla ödemeyle 500 TL tamamlanınca Tamamen ödendi", () => {
    const { w, pay } = setup();
    pay(20000); pay(30000);
    expect(orderBalance(w.id)).toMatchObject({ paid: 50000, remaining: 0, state: "paid" });
  });
  it("fazla ödeme engellenir", () => {
    const { w, pay } = setup();
    expect(() => pay(50001)).toThrow(/Fazla ödeme/);
    pay(40000);
    expect(() => pay(10001)).toThrow(/Fazla ödeme/);
    expect(repo.payments.list()).toHaveLength(1);
    expect(orderBalance(w.id)?.remaining).toBe(10000);
  });
  it("iptal/iade edilen ödeme borçtan düşmez, kayıt silinmez ve loglanır", () => {
    const { w, pay } = setup();
    const p1 = pay(20000), p2 = pay(10000);
    markPayment(p1.id, "cancelled");
    markPayment(p2.id, "refunded");
    expect(orderBalance(w.id)).toMatchObject({ paid: 0, remaining: 50000, state: "unpaid" });
    expect(repo.payments.list()).toHaveLength(2);
    expect(auditOf(p1.id).some((a) => a.details?.includes("cancelled"))).toBe(true);
    expect(() => markPayment(p1.id, "refunded")).toThrow();
    // iptal sonrası kalan borç kadar yeniden ödeme girilebilir
    pay(50000);
    expect(orderBalance(w.id)?.state).toBe("paid");
  });
  it("servisin para biriminden farklı ödeme reddedilir", () => {
    const { pay } = setup();
    expect(() => pay(1000, "USD")).toThrow(/para birimi/);
    expect(repo.payments.list()).toHaveLength(0);
  });
  it("customerBalance servis (workOrderId) bazında hesaplanır, para birimleri ayrı", () => {
    const { c, w, pay } = setup();
    pay(20000);
    const usd = saveWorkOrder({ customerId: c.id, vehicleId: w.vehicleId, statusId: w.statusId, enteredAt: w.enteredAt, currency: "USD" }, [{ name: "Parça", kind: "part", amount: 10000 }]);
    recordPayment({ workOrderId: usd.id, money: { amount: 4000, currency: "USD" }, method: "transfer", paidAt: "2026-03-03T00:00:00.000Z" });
    const p = recordPayment({ workOrderId: usd.id, money: { amount: 1000, currency: "USD" }, method: "transfer", paidAt: "2026-03-03T00:00:00.000Z" });
    markPayment(p.id, "cancelled");
    const b = customerBalance(c.id);
    expect(b.find((x) => x.currency === "TRY")).toEqual({ currency: "TRY", total: 50000, paid: 20000, unpaid: 30000 });
    expect(b.find((x) => x.currency === "USD")).toEqual({ currency: "USD", total: 10000, paid: 4000, unpaid: 6000 });
  });
  it("ödemesi olan servisin toplamı ödenenin altına düşemez", () => {
    const { w, pay } = setup();
    pay(40000);
    expect(() => saveWorkOrder({ customerId: w.customerId, vehicleId: w.vehicleId, statusId: w.statusId, enteredAt: w.enteredAt, currency: "TRY" },
      itemsOfOrderForTest(w.id).map((i) => ({ ...i, amount: 10000 })), w.id)).toThrow();
  });
});
import { itemsOfOrder } from "./repository";
const itemsOfOrderForTest = (id: string) => itemsOfOrder(id).map((i) => ({ id: i.id, name: i.name, kind: i.kind, amount: i.amount.amount }));

import { periodRange, inRange } from "./periods";
import { recordExpense, periodSummary, serviceIndicators } from "./repository";
describe("tarih aralıkları", () => {
  const now = new Date(2026, 0, 7, 15, 0); // 7 Ocak 2026 Çarşamba
  it("bu hafta pazartesi başlar, geçen hafta 7 gün önce", () => {
    expect(periodRange("thisWeek", now)).toEqual({ from: new Date(2026, 0, 5), to: new Date(2026, 0, 12) });
    expect(periodRange("lastWeek", now)).toEqual({ from: new Date(2025, 11, 29), to: new Date(2026, 0, 5) });
  });
  it("geçen ay yıl sınırını geçer, dün doğru gün", () => {
    expect(periodRange("lastMonth", now)).toEqual({ from: new Date(2025, 11, 1), to: new Date(2026, 0, 1) });
    expect(periodRange("yesterday", now)).toEqual({ from: new Date(2026, 0, 6), to: new Date(2026, 0, 7) });
  });
  it("özel aralıkta bitiş günü dahil", () => {
    const r = periodRange("custom", now, { from: "2026-01-01", to: "2026-01-03" });
    expect(inRange(new Date(2026, 0, 3, 23, 59).toISOString(), r)).toBe(true);
    expect(inRange(new Date(2026, 0, 4).toISOString(), r)).toBe(false);
  });
});

describe("gelir / gider / genel bakış", () => {
  const d = (day: number) => new Date(2026, 2, day, 12).toISOString(); // Mart 2026
  const march = { from: new Date(2026, 2, 1), to: new Date(2026, 3, 1) };
  const setup = () => {
    ensureServiceDefaults();
    const c = repo.customers.create({ firstName: "G", lastName: "G", phone: "05321234567" });
    const v = repo.vehicles.create({ customerId: c.id, plate: "34GG1", brand: "X", model: "Y", type: "Otomobil" });
    const st = (l: string) => listStatuses(true).find((s) => s.label === l)!.id;
    const order = (enteredAt: string, amount: number, currency: "TRY" | "USD" = "TRY") =>
      saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: st("Yeni"), enteredAt, currency }, [{ name: "K", kind: "labor", amount }]);
    return { order, st };
  };
  it("tahsilat ödeme tarihine göre, ciro servis açılış tarihine göre; iptal edilen ödeme sayılmaz", () => {
    const { order } = setup();
    const feb = order(new Date(2026, 1, 20).toISOString(), 100000); // şubatta açıldı
    recordPayment({ workOrderId: feb.id, money: { amount: 40000, currency: "TRY" }, method: "cash", paidAt: d(5) }); // martta ödendi
    const p = recordPayment({ workOrderId: feb.id, money: { amount: 10000, currency: "TRY" }, method: "cash", paidAt: d(6) });
    markPayment(p.id, "cancelled");
    const mar = order(d(10), 30000);
    const s = periodSummary(march).find((x) => x.currency === "TRY")!;
    expect(s.collected).toBe(40000);
    expect(s.revenue).toBe(30000);
    expect(s.pending).toBe(30000);
    expect(mar).toBeTruthy();
  });
  it("net = tahsilat − gider, para birimi bazında ayrı", () => {
    const { order } = setup();
    const t = order(d(2), 100000), u = order(d(2), 50000, "USD");
    recordPayment({ workOrderId: t.id, money: { amount: 80000, currency: "TRY" }, method: "cash", paidAt: d(3) });
    recordPayment({ workOrderId: u.id, money: { amount: 20000, currency: "USD" }, method: "transfer", paidAt: d(3) });
    recordExpense({ category: "Kira", money: { amount: 30000, currency: "TRY" }, method: "transfer", spentAt: d(4) });
    recordExpense({ category: "Parça alımı", money: { amount: 25000, currency: "USD" }, method: "cash", spentAt: d(4) });
    recordExpense({ category: "Elektrik", money: { amount: 99999, currency: "TRY" }, method: "cash", spentAt: new Date(2026, 3, 2).toISOString() }); // nisan: dışarıda
    const s = periodSummary(march);
    expect(s.find((x) => x.currency === "TRY")).toMatchObject({ collected: 80000, expense: 30000, net: 50000 });
    expect(s.find((x) => x.currency === "USD")).toMatchObject({ collected: 20000, expense: 25000, net: -5000 });
  });
  it("arşivlenen gider toplama girmez; geçersiz kategori reddedilir", () => {
    setup();
    const e = recordExpense({ category: "Su", money: { amount: 5000, currency: "TRY" }, method: "cash", spentAt: d(8) });
    repo.expenses.archive(e.id);
    expect(periodSummary(march)[0]!.expense).toBe(0);
    expect(() => recordExpense({ category: "Tatil", money: { amount: 5000, currency: "TRY" }, method: "cash", spentAt: d(8) })).toThrow();
  });
  it("servis göstergeleri: devam eden, teslim bekleyen, ödemesi bekleyen, bugün açılan", () => {
    const { order, st } = setup();
    const today = new Date().toISOString();
    order(today, 10000);
    const done = order(d(1), 20000);
    setOrderStatus(done.id, st("Tamamlandı"));
    recordPayment({ workOrderId: done.id, money: { amount: 20000, currency: "TRY" }, method: "cash", paidAt: d(2) });
    const i = serviceIndicators();
    expect(i).toMatchObject({ inProgress: 1, awaitingDelivery: 1, awaitingPayment: 1, openedToday: 1 });
    expect(i.recentCompleted.map((w) => w.id)).toEqual([done.id]);
  });
});

import { parseAmount } from "@/components/WorkOrderForm";
describe("tutar girişi", () => {
  it("Türkçe binlik ayırıcı: 1.200 = 1200 TL", () => {
    expect(parseAmount("1.200")).toBe(120000);
    expect(parseAmount("12.500.000")).toBe(1250000000);
    expect(parseAmount("1.250,50")).toBe(125050);
    expect(parseAmount("1250.5")).toBe(125050);
    expect(parseAmount("abc")).toBeNull();
  });
});

import { financeReport, serviceReport, vehicleCustomerReport } from "./repository";
import { splitRange } from "./periods";
describe("raporlar", () => {
  const d = (day: number, month = 2) => new Date(2026, month, day, 12).toISOString();
  const march = { from: new Date(2026, 2, 1), to: new Date(2026, 3, 1) };
  const setup = () => {
    ensureServiceDefaults();
    const st = (l: string) => listStatuses(true).find((s) => s.label === l)!.id;
    const c1 = repo.customers.create({ firstName: "Ali", lastName: "Veli", phone: "05321110000" });
    const c2 = repo.customers.create({ firstName: "Can", lastName: "Er", phone: "05322220000" });
    const v1 = repo.vehicles.create({ customerId: c1.id, plate: "34AA1", brand: "X", model: "Y", type: "Otomobil" });
    const v2 = repo.vehicles.create({ customerId: c2.id, plate: "06BB2", brand: "X", model: "Z", type: "Otomobil" });
    const order = (v: typeof v1, enteredAt: string, amount: number, currency: "TRY" | "USD" = "TRY") =>
      saveWorkOrder({ customerId: v.customerId, vehicleId: v.id, statusId: st("Yeni"), enteredAt, currency }, [{ name: "K", kind: "labor", amount }]);
    return { st, v1, v2, order };
  };

  it("hafta pazartesi başlar, dilimler aralığa kırpılır; ay etiketi Türkçe", () => {
    const w = splitRange(march, "week");
    expect(w[0]).toMatchObject({ from: new Date(2026, 2, 1), to: new Date(2026, 2, 2) }); // 1 Mart pazar
    expect(w[1]!.from).toEqual(new Date(2026, 2, 2));
    expect(w.at(-1)!.to).toEqual(new Date(2026, 3, 1));
    expect(splitRange(march, "day")).toHaveLength(31);
    expect(splitRange(march, "month").map((b) => b.label)).toEqual(["Mart 2026"]);
  });

  it("servis raporu: açılan servisler şu anki duruma göre ayrılır, dönem dışı sayılmaz", () => {
    const { st, v1, order } = setup();
    const a = order(v1, d(2), 1000), b = order(v1, d(3), 1000), c = order(v1, d(3), 1000);
    order(v1, d(2, 3), 1000); // nisan: dışarıda
    setOrderStatus(a.id, st("Tamamlandı"));
    setOrderStatus(b.id, st("Teslim edildi"));
    setOrderStatus(c.id, st("İptal"));
    order(v1, d(4), 1000);
    const r = serviceReport({ range: march }, "day");
    expect(r).toMatchObject({ opened: 4, active: 1, completed: 1, delivered: 1, cancelled: 1 });
    expect(r.series[2]!.value).toBe(2); // 3 Mart
  });

  it("finans: bekleyen/kısmi ayrı; para birimleri ayrı satır; ödeme yöntemine göre dağılım", () => {
    const { v1, v2, order } = setup();
    const t1 = order(v1, d(2), 100000), t2 = order(v2, d(2), 50000), u = order(v1, d(2), 30000, "USD");
    recordPayment({ workOrderId: t1.id, money: { amount: 40000, currency: "TRY" }, method: "cash", paidAt: d(5) });
    recordPayment({ workOrderId: t1.id, money: { amount: 10000, currency: "TRY" }, method: "credit_card", paidAt: d(6) });
    recordPayment({ workOrderId: u.id, money: { amount: 30000, currency: "USD" }, method: "transfer", paidAt: d(6) });
    recordExpense({ category: "Kira", money: { amount: 20000, currency: "TRY" }, method: "transfer", spentAt: d(7) });
    const rows = financeReport({ range: march }, "month");
    const tr = rows.find((r) => r.currency === "TRY")!, us = rows.find((r) => r.currency === "USD")!;
    expect(tr).toMatchObject({ collected: 50000, pending: 100000, pendingCount: 2, partial: 50000, partialCount: 1, expense: 20000, net: 30000 });
    expect(tr.byMethod.find((m) => m.method === "cash")).toMatchObject({ value: 40000, count: 1 });
    expect(tr.byMethod.find((m) => m.method === "credit_card")!.value).toBe(10000);
    expect(us).toMatchObject({ collected: 30000, pending: 0, expense: 0, net: 30000 });
    expect(tr.series).toEqual([{ label: "Mart 2026", value: 50000 }]);
    expect(t2).toBeTruthy();
  });

  it("filtreler: plaka/müşteri/ödeme durumu/para birimi servise ve tahsilata uygulanır", () => {
    const { v1, v2, order } = setup();
    const t1 = order(v1, d(2), 100000); order(v2, d(2), 50000); order(v1, d(2), 30000, "USD");
    recordPayment({ workOrderId: t1.id, money: { amount: 40000, currency: "TRY" }, method: "cash", paidAt: d(5) });
    expect(serviceReport({ range: march, plate: "06 bb" }, "day").opened).toBe(1);
    expect(serviceReport({ range: march, customer: "ali" }, "day").opened).toBe(2);
    expect(serviceReport({ range: march, paymentState: "partial" }, "day").opened).toBe(1);
    const f = financeReport({ range: march, currency: "TRY", plate: "06BB2" }, "month");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ currency: "TRY", collected: 0, pending: 50000 });
  });

  it("araç/müşteri: en çok işlem gören araç önce; müşteri × para birimi ayrı satır", () => {
    const { v1, v2, order } = setup();
    const t1 = order(v1, d(2), 100000); order(v1, d(3), 20000); order(v1, d(3), 30000, "USD"); order(v2, d(4), 50000);
    recordPayment({ workOrderId: t1.id, money: { amount: 100000, currency: "TRY" }, method: "cash", paidAt: d(5) });
    const r = vehicleCustomerReport({ range: march });
    expect(r.vehicles.map((v) => [v.plate, v.count])).toEqual([["34AA1", 3], ["06BB2", 1]]);
    expect(r.vehicles[0]!.totals).toEqual([{ amount: 120000, currency: "TRY" }, { amount: 30000, currency: "USD" }]);
    const ali = r.customers.filter((c) => c.customerId === v1.customerId);
    expect(ali.map((c) => [c.currency, c.collected, c.pending])).toEqual([["TRY", 100000, 20000], ["USD", 0, 30000]]);
  });
});

import { fillTemplate, sendSmsForOrder, retrySms, setSmsSetting, onOrderCompleted, DEFAULT_SMS_TEMPLATE, smsLength } from "./repository";
describe("sms", () => {
  const setup = (phone = "05321234567") => {
    ensureServiceDefaults();
    const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone });
    const v = repo.vehicles.create({ customerId: c.id, plate: "34ABC123", brand: "Renault", model: "Clio", type: "Otomobil" });
    const st = (l: string) => listStatuses().find((s) => s.label === l)!.id;
    const w = saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: st("Yeni"), enteredAt: "2026-03-01T00:00:00.000Z", currency: "TRY" },
      [{ name: "İşçilik", kind: "labor", amount: 100000 }]);
    return { c, v, w, st };
  };
  it("şablon değişkenleri doldurulur", () => {
    expect(fillTemplate(DEFAULT_SMS_TEMPLATE, { MusteriAdi: "Ali Kaya", Plaka: "34ABC123" }))
      .toBe("Sayın Ali Kaya, 34ABC123 plakalı aracınızın işlemi tamamlanmıştır. Aracınızı teslim alabilirsiniz.");
    expect(fillTemplate("{Marka} {Model} - {IsletmeAdi}", { Marka: "Fiat", Model: "Egea", IsletmeAdi: "Usta Oto" })).toBe("Fiat Egea - Usta Oto");
  });
  it("ödeme alınmadan tamamlanınca SMS tetiklenir ve kaydı oluşur", () => {
    const { w, st } = setup();
    const fired: string[] = [];
    const off = onOrderCompleted((id) => fired.push(id));
    setOrderStatus(w.id, st("Tamamlandı"));
    off();
    expect(fired).toEqual([w.id]);
    expect(orderBalance(w.id)?.paid).toBe(0);
    const log = sendSmsForOrder(w.id, "Test");
    expect(log.status).toBe("sent");
    expect(log.plate).toBe("34ABC123");
    expect(repo.smsLogs.list()).toHaveLength(1);
  });
  it("telefon yoksa hata kaydı oluşur", () => {
    const { w } = setup("");
    const log = sendSmsForOrder(w.id, "Test");
    expect(log.status).toBe("failed");
    expect(log.error).toBe("Müşteri telefonu yok");
  });
  it("başarısız gönderim aynı kayıt üzerinde tekrar denenir", () => {
    const { w } = setup();
    setSmsSetting("simulateSuccess", false);
    const log = sendSmsForOrder(w.id, "Test");
    expect(log.status).toBe("failed");
    setSmsSetting("simulateSuccess", true);
    const r = retrySms(log.id);
    expect(r.status).toBe("sent");
    expect(r.attempts).toBe(2);
    expect(repo.smsLogs.list({ includeArchived: true })).toHaveLength(1);
  });
  it("SMS parça sayısı", () => {
    expect(smsLength("a".repeat(160)).parts).toBe(1);
    expect(smsLength("a".repeat(161)).parts).toBe(2);
    expect(smsLength("ş".repeat(71)).parts).toBe(2);
  });
});
