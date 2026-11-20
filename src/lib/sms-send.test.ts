import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureServiceDefaults, listStatuses, repo, saveWorkOrder, setSmsSetting } from "./repository";
import { recoverStuckSms, retryOrderSms, sendOrderSms, sendTestSms } from "./sms-send";

const OK = { status: 200, text: JSON.stringify({ response: { status: { code: 200, message: "İşlem başarılı" } } }) };
const ERR = (code: number) => ({ status: 200, text: JSON.stringify({ response: { status: { code, message: "hata" } } }) });

describe("gerçek SMS akışı (sahte İleti Merkezi sunucusu)", () => {
  const post = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
    (window as unknown as { masaustu: unknown }).masaustu = { httpPost: post };
    setSmsSetting("smsMode", "iletimerkezi");
    setSmsSetting("imKey", "K"); setSmsSetting("imHash", "H"); setSmsSetting("imSender", "USTAOTO");
  });
  afterEach(() => { delete (window as unknown as { masaustu?: unknown }).masaustu; });

  const setup = (phone = "0532 123 45 67") => {
    ensureServiceDefaults();
    const c = repo.customers.create({ firstName: "Ali", lastName: "Kaya", phone });
    const v = repo.vehicles.create({ customerId: c.id, plate: "34ABC123", brand: "Renault", model: "Clio", type: "Otomobil" });
    const st = listStatuses().find((s) => s.label === "Yeni")!.id;
    return saveWorkOrder({ customerId: c.id, vehicleId: v.id, statusId: st, enteredAt: "2026-03-01T00:00:00.000Z", currency: "TRY" }, [{ name: "İşçilik", kind: "labor", amount: 100000 }]);
  };

  it("başarılı gönderim: doğru adres, doğru gövde, kayıt 'sent'", async () => {
    post.mockResolvedValue(OK);
    const w = setup();
    const log = await sendOrderSms(w.id, "Merhaba");
    expect(log.status).toBe("sent");
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0]!;
    expect(url).toBe("https://api.iletimerkezi.com/v1/send-sms/json");
    const j = JSON.parse(body);
    expect(j.request.order.message.receipents.number).toEqual(["905321234567"]);
    expect(j.request.order.sender).toBe("USTAOTO");
  });

  it("yanlış anahtar: failed + açıklama; düzeltince aynı kayıt yeniden gönderilir", async () => {
    post.mockResolvedValueOnce(ERR(401));
    const w = setup();
    const log = await sendOrderSms(w.id, "Merhaba");
    expect(log.status).toBe("failed");
    expect(log.error).toContain("API erişimine izin ver");
    post.mockResolvedValueOnce(OK);
    const again = await retryOrderSms(log.id);
    expect(again.id).toBe(log.id);
    expect(again.status).toBe("sent");
    expect(again.attempts).toBe(2);
    expect(repo.smsLogs.list()).toHaveLength(1);
  });

  it("internet yok / bağlantı hatası: failed olarak kaydedilir, çökmez", async () => {
    post.mockRejectedValue(new Error("net::ERR_INTERNET_DISCONNECTED"));
    const log = await sendOrderSms(setup().id, "Merhaba");
    expect(log.status).toBe("failed");
    expect(log.error).toContain("ERR_INTERNET");
  });

  it("geçersiz telefon: istek hiç atılmaz", async () => {
    const log = await sendOrderSms(setup("0212 444 55 66").id, "Merhaba");
    expect(log.status).toBe("failed");
    expect(post).not.toHaveBeenCalled();
  });

  it("anahtar yoksa veya başlık Türkçe karakter içeriyorsa istek atılmaz", async () => {
    setSmsSetting("imKey", "");
    expect((await sendOrderSms(setup().id, "x")).status).toBe("failed");
    setSmsSetting("imKey", "K"); setSmsSetting("imSender", "ÜSTAOTO");
    const r = await sendTestSms("05321234567", "x");
    expect(r.ok).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("aynı mesaj tekrar (451) anlaşılır hata verir", async () => {
    post.mockResolvedValue(ERR(451));
    const log = await sendOrderSms(setup().id, "Merhaba");
    expect(log.error).toContain("tekrar");
  });

  it("yarım kalan 'queued' kayıt başarısıza çevrilir", () => {
    const w = setup();
    const l = repo.smsLogs.create({ workOrderId: w.id, phone: "0532", message: "x", status: "queued", attempts: 0 });
    expect(recoverStuckSms(0)).toBe(1);
    expect(repo.smsLogs.get(l.id)?.status).toBe("failed");
  });

  it("simülasyon modunda ağ isteği atılmaz", async () => {
    setSmsSetting("smsMode", "simulate");
    const log = await sendOrderSms(setup().id, "Merhaba");
    expect(log.status).toBe("sent");
    expect(post).not.toHaveBeenCalled();
  });
});
