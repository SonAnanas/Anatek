import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAllTables, repo, setSmsSetting } from "./repository";
import { applyRestore, createBackup, prepareRestore } from "./backup";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

function seed() {
  const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone: "05321112233" });
  const v = repo.vehicles.create({ customerId: c.id, plate: "34ABC123", brand: "Fiat", model: "Egea", type: "Otomobil" });
  const w = repo.workOrders.create({ orderNo: "S-1", vehicleId: v.id, customerId: c.id, statusId: "x", enteredAt: "2026-01-01", currency: "TRY" });
  repo.workOrderItems.create({ workOrderId: w.id, name: "Yağ", kind: "part", amount: { amount: 10000, currency: "TRY" } });
  repo.payments.create({ workOrderId: w.id, customerId: c.id, money: { amount: 5000, currency: "TRY" }, method: "cash", status: "active", paidAt: "2026-01-02" });
  repo.customers.archive(repo.customers.create({ firstName: "Eski", lastName: "Kayıt", phone: "1" }).id);
  return { c, w };
}
const strip = (d: ReturnType<typeof readAllTables>) => ({ ...d, auditLogs: [] });

describe("yedekleme", () => {
  it("yedek al → veriyi boz → geri yükle → veri aynı", async () => {
    seed();
    const before = readAllTables();
    const text = await createBackup();
    repo.customers.update(before.customers[0]!.id, { firstName: "Bozuk" });
    repo.vehicles.archive(before.vehicles[0]!.id);
    const p = await prepareRestore(text);
    applyRestore(p.data);
    expect(strip(readAllTables())).toEqual(strip(before));
    expect(readAllTables().customers.filter((c) => c.archived)).toHaveLength(1);
  });
  it("API anahtarı yedeğe konmaz", async () => {
    setSmsSetting("apiKey", "GIZLI123");
    expect(await createBackup()).not.toContain("GIZLI123");
  });
  it("bir karakteri değiştirilmiş dosya reddedilir", async () => {
    seed();
    const text = (await createBackup()).replace("Ali", "Alı");
    await expect(prepareRestore(text)).rejects.toThrow(/bozuk/i);
  });
  it("kopuk ilişkili dosya reddedilir", async () => {
    const { c } = seed();
    repo.customers.update(c.id, {});
    const data = readAllTables();
    data.customers = data.customers.filter((x) => x.id !== c.id);
    await expect(prepareRestore(await createBackup("", data))).rejects.toThrow(/kopuk/i);
  });
  it("yanlış parola reddedilir, doğru parola açar", async () => {
    seed();
    const text = await createBackup("dogru");
    await expect(prepareRestore(text, "yanlis")).rejects.toThrow(/Parola yanlış/);
    await expect(prepareRestore(text)).rejects.toThrow(/şifreli/);
    expect((await prepareRestore(text, "dogru")).backupCounts.customers).toBe(2);
  });
  it("yeni şema sürümü reddedilir", async () => {
    seed();
    const f = JSON.parse(await createBackup()); f.schemaVersion = 99;
    await expect(prepareRestore(JSON.stringify(f))).rejects.toThrow(/daha yeni/);
  });
  it("geri yükleme ortasında hata olursa mevcut veri korunur", async () => {
    seed();
    const text = await createBackup();
    repo.customers.update(readAllTables().customers[0]!.id, { firstName: "Yeni" });
    const current = readAllTables();
    const p = await prepareRestore(text);
    const orig = Storage.prototype.setItem;
    let n = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === "otoservis:workOrders" && n++ === 0) throw new Error("QuotaExceeded");
      return orig.call(this, k, v);
    });
    expect(() => applyRestore(p.data)).toThrow(/korundu/);
    vi.restoreAllMocks();
    expect(readAllTables()).toEqual(current);
  });
});
