// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const require = createRequire(import.meta.url);
const { downloadAndVerify, parseSums } = require("../../electron/updater.cjs");

const FILE = Buffer.from("ANATEK-KURULUM".repeat(40000));
const SHA = crypto.createHash("sha256").update(FILE).digest("hex");
let server: http.Server, base: string, dir: string;
let sums = `${SHA}  Anatek-Kurulum.exe\n`;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "anatek-upd-"));
  server = http.createServer((req, res) => {
    if (req.url === "/SHA256SUMS.txt") { res.end(sums); return; }
    if (req.url === "/missing") { res.statusCode = 404; res.end(); return; }
    if (req.url === "/ok") { res.setHeader("content-length", FILE.length); res.end(FILE); return; }
    if (req.url === "/corrupt") { const b = Buffer.from(FILE); b[10] = (b[10] ?? 0) ^ 0xff; res.setHeader("content-length", b.length); res.end(b); return; }
    if (req.url === "/cut") { res.setHeader("content-length", FILE.length); res.write(FILE.subarray(0, 50000)); setTimeout(() => res.destroy(), 30); return; }
    if (req.url === "/slow") { res.setHeader("content-length", FILE.length); res.write(FILE.subarray(0, 1000)); return; } // bitmez
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections?.(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const run = (path_: string, extra: Record<string, unknown> = {}) =>
  downloadAndVerify({ url: base + path_, sumsUrl: base + "/SHA256SUMS.txt", assetName: "Anatek-Kurulum.exe", destDir: dir, ...extra });
const leftovers = () => fs.readdirSync(dir).filter((f) => f.startsWith("Anatek-Kurulum.exe"));

describe("güvenli güncelleme indirme", () => {
  it("sağlam dosya indirilir, ilerleme bildirilir, SHA-256 doğrulanır", async () => {
    const seen: number[] = [];
    const r = await run("/ok", { onProgress: (p: { received: number }) => seen.push(p.received) });
    expect(r.sha256).toBe(SHA);
    expect(fs.readFileSync(r.file).equals(FILE)).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(FILE.length);
    expect(leftovers()).toEqual(["Anatek-Kurulum.exe"]);
  });
  it("bozuk dosya (hash tutmaz) silinir ve asla teslim edilmez", async () => {
    await expect(run("/corrupt")).rejects.toMatchObject({ code: "HASH", message: expect.stringContaining("çalıştırılmadı") });
    expect(leftovers()).toEqual([]);
  });
  it("internet yarıda kesilirse yarım dosya silinir, anlaşılır Türkçe hata verilir", async () => {
    await expect(run("/cut")).rejects.toMatchObject({ code: "NETWORK", message: expect.stringContaining("İnternet bağlantısı") });
    expect(leftovers()).toEqual([]);
  });
  it("disk yetersizse indirmeye başlanmaz", async () => {
    await expect(run("/ok", { statfs: () => ({ bavail: 10, bsize: 1024 }) })).rejects.toMatchObject({ code: "DISK", message: expect.stringContaining("Yetersiz disk alanı") });
    expect(leftovers()).toEqual([]);
  });
  it("doğrulama dosyasında kurulum dosyası yoksa veya sunucu hata verirse indirilmez", async () => {
    sums = `${SHA}  baska-dosya.exe\n`;
    await expect(run("/ok")).rejects.toMatchObject({ code: "SUMS" });
    sums = `${SHA}  Anatek-Kurulum.exe\n`;
    await expect(run("/missing")).rejects.toMatchObject({ code: "HTTP" });
    await expect(downloadAndVerify({ url: base + "/ok", sumsUrl: base + "/yok", assetName: "Anatek-Kurulum.exe", destDir: dir })).rejects.toMatchObject({ code: "SUMS" });
    expect(leftovers()).toEqual([]);
  });
  it("kullanıcı iptal ederse indirme durur ve yarım dosya silinir", async () => {
    const ctl = new AbortController();
    const p = run("/slow", { signal: ctl.signal, onProgress: () => ctl.abort() });
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
    expect(leftovers()).toEqual([]);
  });
  it("bağlantı hiç kurulamazsa (sunucu kapalı) ağ hatası verir", async () => {
    await expect(downloadAndVerify({ url: "http://127.0.0.1:1/x", sumsUrl: "http://127.0.0.1:1/s", assetName: "Anatek-Kurulum.exe", destDir: dir })).rejects.toMatchObject({ code: "NETWORK" });
  });
  it("SHA256SUMS biçimlerini okur", () => {
    const m = parseSums(`${SHA}  a.exe\n${SHA.toUpperCase()} *b.apk\nbozuk satır\n`);
    expect([...m.keys()]).toEqual(["a.exe", "b.apk"]);
    expect(m.get("b.apk")).toBe(SHA);
  });
});
