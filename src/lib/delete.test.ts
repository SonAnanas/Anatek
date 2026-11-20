import { beforeEach, describe, expect, it } from "vitest";
import { deleteCustomer, deleteVehicle, deleteWorkOrder, previewDeleteCustomer, readAllTables, repo, undoLastDelete } from "./repository";

beforeEach(() => localStorage.clear());

function seed() {
  const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone: "05321112233" });
  const other = repo.customers.create({ firstName: "Veli", lastName: "Can", phone: "05321112299" });
  const v1 = repo.vehicles.create({ customerId: c.id, plate: "34A1", brand: "Fiat", model: "Egea", type: "Otomobil" });
  const v2 = repo.vehicles.create({ customerId: c.id, plate: "34A2", brand: "Ford", model: "Focus", type: "Otomobil" });
  const mk = (vehicleId: string, customerId: string, no: string) => {
    const w = repo.workOrders.create({ orderNo: no, vehicleId, customerId, statusId: "s", enteredAt: "2026-01-01", currency: "TRY" });
    repo.workOrderItems.create({ workOrderId: w.id, name: "Yağ", kind: "part", amount: { amount: 1000, currency: "TRY" } });
    repo.payments.create({ workOrderId: w.id, customerId, money: { amount: 500, currency: "TRY" }, method: "cash", status: "active", paidAt: "2026-01-02" });
    repo.smsLogs.create({ customerId, workOrderId: w.id, phone: "1", message: "x", status: "sent" });
    return w;
  };
  const w1 = mk(v1.id, c.id, "S-1"); mk(v2.id, c.id, "S-2");
  const ov = repo.vehicles.create({ customerId: other.id, plate: "06B1", brand: "Fiat", model: "Doblo", type: "Otomobil" });
  mk(ov.id, other.id, "S-3");
  return { c, other, v1, w1 };
}
const noOrphans = () => {
  const d = readAllTables();
  const C = new Set(d.customers.map((x) => x.id)), V = new Set(d.vehicles.map((x) => x.id)), W = new Set(d.workOrders.map((x) => x.id));
  expect(d.vehicles.every((v) => C.has(v.customerId))).toBe(true);
  expect(d.workOrders.every((w) => V.has(w.vehicleId) && C.has(w.customerId))).toBe(true);
  expect(d.workOrderItems.every((i) => W.has(i.workOrderId))).toBe(true);
  expect(d.payments.every((p) => W.has(p.workOrderId))).toBe(true);
  expect(d.smsLogs.every((s) => !s.workOrderId || W.has(s.workOrderId))).toBe(true);
};

describe("kalıcı silme", () => {
  it("müşteri silinince bağlı her şey gider, sahipsiz kayıt kalmaz", () => {
    const { c, other } = seed();
    expect(previewDeleteCustomer(c.id)).toEqual({ customers: 1, vehicles: 2, workOrders: 2, workOrderItems: 2, payments: 2, smsLogs: 2 });
    deleteCustomer(c.id);
    const d = readAllTables();
    expect(d.customers.map((x) => x.id)).toEqual([other.id]);
    expect(d.vehicles).toHaveLength(1); expect(d.workOrders).toHaveLength(1); expect(d.payments).toHaveLength(1); expect(d.smsLogs).toHaveLength(1);
    noOrphans();
    expect(d.auditLogs.some((a) => a.action === "delete" && a.details?.includes("Müşteri Ali Kaya silindi"))).toBe(true);
  });
  it("araç silinince müşteri kalır", () => {
    const { c, v1 } = seed();
    deleteVehicle(v1.id);
    expect(repo.customers.get(c.id)).toBeTruthy();
    expect(repo.vehicles.get(v1.id)).toBeUndefined();
    expect(readAllTables().workOrders).toHaveLength(2);
    noOrphans();
  });
  it("servis silinince araç ve müşteri kalır", () => {
    const { c, v1, w1 } = seed();
    deleteWorkOrder(w1.id);
    expect(repo.customers.get(c.id)).toBeTruthy(); expect(repo.vehicles.get(v1.id)).toBeTruthy();
    expect(readAllTables().workOrderItems).toHaveLength(2);
    noOrphans();
  });
  it("undoLastDelete hepsini geri getirir", () => {
    const { c } = seed();
    const before = readAllTables();
    deleteCustomer(c.id);
    undoLastDelete();
    const after = readAllTables();
    for (const t of ["customers", "vehicles", "workOrders", "workOrderItems", "payments", "smsLogs"] as const)
      expect([...after[t]].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...before[t]].sort((a, b) => a.id.localeCompare(b.id)));
  });
  it("önizleme (2. onay iptal) hiçbir şeyi silmez", () => {
    const { c } = seed();
    const before = readAllTables();
    previewDeleteCustomer(c.id);
    expect(readAllTables()).toEqual(before);
  });
});
