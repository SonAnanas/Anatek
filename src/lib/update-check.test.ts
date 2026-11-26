import { describe, expect, it } from "vitest";
import { checkForUpdate, compareBuild, parseBuildNumber } from "./update-check";

describe("güncelleme kontrolü", () => {
  it("başlıktan derleme numarasını okur", () => {
    expect(parseBuildNumber("Anatek - Son Surum (derleme 57)")).toBe(57);
    expect(parseBuildNumber("Anatek")).toBeNull();
  });
  it("yeni / güncel / belirsiz", () => {
    expect(compareBuild("12", "Anatek - Son Surum (derleme 13)").state).toBe("newer");
    expect(compareBuild("13", "Anatek - Son Surum (derleme 13)").state).toBe("current");
    expect(compareBuild("14", "Anatek - Son Surum (derleme 13)").state).toBe("current");
    expect(compareBuild("yerel", "Anatek - Son Surum (derleme 13)").state).toBe("unknown");
    expect(compareBuild("12", "başlık yok").state).toBe("unknown");
  });
  it("ağ ve sunucu hatalarında çökmez", async () => {
    const ok = (async () => new Response(JSON.stringify({ name: "Anatek - Son Surum (derleme 20)" }))) as unknown as typeof fetch;
    expect((await checkForUpdate(ok, "a/b", "19")).state).toBe("newer");
    const fail = (async () => { throw new Error("ağ yok"); }) as unknown as typeof fetch;
    expect((await checkForUpdate(fail, "a/b", "19")).state).toBe("unknown");
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect((await checkForUpdate(notFound, "a/b", "19")).message).toContain("404");
    expect((await checkForUpdate(ok, "", "19")).state).toBe("unknown");
  });
});

import { getStoredUpdate, maybeCheckUpdate } from "./update-check";

describe("güncelleme bilgisi ve arka plan kontrolü", () => {
  const rel = (name: string) => (async () => new Response(JSON.stringify({ name, published_at: "2026-11-22T10:00:00Z", body: "Yeni sürüm notları" }))) as unknown as typeof fetch;
  it("yayın tarihi ve notları döndürür", async () => {
    const r = await checkForUpdate(rel("Anatek - Son Surum (derleme 30)"), "a/b", "29");
    expect(r).toMatchObject({ state: "newer", latest: 30, publishedAt: "2026-11-22T10:00:00Z", notes: "Yeni sürüm notları" });
  });
  it("12 saat içinde tekrar sorgulamaz; ulaşılamazsa kaydetmez", async () => {
    localStorage.clear();
    let calls = 0;
    const counted = (async () => { calls++; return rel("Anatek - Son Surum (derleme 40)")("" as never); }) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await maybeCheckUpdate(counted, t0, "a/b", "39")).toMatchObject({ state: "newer", latest: 40 });
    expect(await maybeCheckUpdate(counted, t0 + 3600_000, "a/b", "39")).toMatchObject({ latest: 40 });
    expect(calls).toBe(1);
    expect(await maybeCheckUpdate(counted, t0 + 13 * 3600_000, "a/b", "39")).toMatchObject({ latest: 40 });
    expect(calls).toBe(2);
    localStorage.clear();
    const down = (async () => { throw new Error("ağ yok"); }) as unknown as typeof fetch;
    expect(await maybeCheckUpdate(down, t0, "a/b", "39")).toBeNull();
    expect(getStoredUpdate()).toBeNull();
    expect(await maybeCheckUpdate(counted, t0, "", "39")).toBeNull();
  });
});
