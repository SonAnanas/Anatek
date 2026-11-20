import { describe, expect, it } from "vitest";
import { buildBody, parseImResponse, toMsisdn } from "./sms-provider";

describe("İleti Merkezi", () => {
  it("telefonu 90 ile başlayan 12 haneye çevirir", () => {
    expect(toMsisdn("0532 111 22 33")).toBe("905321112233");
    expect(toMsisdn("+90 532 111 22 33")).toBe("905321112233");
  });
  it("cep olmayan veya eksik numarayı reddeder", () => {
    expect(toMsisdn("0212 444 55 66")).toBeNull();
    expect(toMsisdn("532 111")).toBeNull();
    expect(toMsisdn("")).toBeNull();
  });
  it("istek gövdesi belgedeki yapıda", () => {
    const b = buildBody({ key: "K", hash: "H", sender: "BASLIK" }, "905321112233", "Merhaba");
    expect(b.request.authentication).toEqual({ key: "K", hash: "H" });
    expect(b.request.order.sender).toBe("BASLIK");
    expect(b.request.order.iys).toBe("0");
    expect(b.request.order.message).toEqual({ text: "Merhaba", receipents: { number: ["905321112233"] } });
  });
  it("200 kodu başarı", () => {
    expect(parseImResponse(200, JSON.stringify({ response: { status: { code: 200, message: "İşlem başarılı" } } }))).toEqual({ ok: true });
  });
  it("hata kodlarında anlaşılır Türkçe açıklama verir", () => {
    const r = parseImResponse(200, JSON.stringify({ response: { status: { code: 401, message: "Üyelik bilgileri hatalı" } } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("API erişimine izin ver");
    const d = parseImResponse(200, JSON.stringify({ response: { status: { code: 451 } } }));
    if (!d.ok) expect(d.error).toContain("tekrar");
  });
  it("JSON olmayan yanıtı hata sayar", () => {
    expect(parseImResponse(502, "Bad Gateway").ok).toBe(false);
  });
});
