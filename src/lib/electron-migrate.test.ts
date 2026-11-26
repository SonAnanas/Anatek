// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { migrateLegacyData, hasData, sha256File } = require("../../electron/migrate.cjs");

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "anatek-mig-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const w = (p: string, data: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
function legacy(name: string) {
  const d = path.join(root, name);
  w(path.join(d, "Local Storage", "leveldb", "000003.log"), "musteri-kayitlari".repeat(500));
  w(path.join(d, "Local Storage", "leveldb", "MANIFEST-000001"), "manifest");
  w(path.join(d, "IndexedDB", "app_local_0.indexeddb.leveldb", "000005.ldb"), "x".repeat(70000));
  w(path.join(d, "Cache", "junk"), "önbellek aktarılmamalı");
  return d;
}
const snapshot = (d: string) => {
  const out: Record<string, string> = {};
  const walk = (x: string) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); e.isDirectory() ? walk(p) : (out[path.relative(d, p)] = sha256File(p)); } };
  walk(d); return out;
};

describe("eski veri klasöründen aktarım", () => {
  it("yeni klasör boşsa eski veriyi bayt bayt doğrulayarak aktarır; eski klasöre dokunmaz", () => {
    const old = legacy("UstaServisTakip"), before = snapshot(old), userData = path.join(root, "Anatek");
    const r = migrateLegacyData({ userData, legacyDirs: [path.join(root, "x"), old] });
    expect(r).toMatchObject({ status: "migrated", from: old, files: 3 });
    expect(hasData(userData)).toBe(true);
    for (const f of ["Local Storage/leveldb/000003.log", "Local Storage/leveldb/MANIFEST-000001", "IndexedDB/app_local_0.indexeddb.leveldb/000005.ldb"])
      expect(sha256File(path.join(userData, ...f.split("/")))).toBe(sha256File(path.join(old, ...f.split("/"))));
    expect(fs.existsSync(path.join(userData, "Cache"))).toBe(false);           // önbellek taşınmaz
    expect(fs.existsSync(path.join(userData, ".migrating"))).toBe(false);      // geçici klasör kalmaz
    expect(JSON.parse(fs.readFileSync(path.join(userData, "migrated-from.json"), "utf8")).files).toBe(3);
    expect(snapshot(old)).toEqual(before);                                     // eski klasör aynen duruyor
  });
  it("yeni klasörde zaten veri varsa hiçbir şey yapmaz; eski klasör yoksa 'none' döner", () => {
    const old = legacy("UstaServisTakip"), userData = path.join(root, "Anatek");
    w(path.join(userData, "Local Storage", "leveldb", "000003.log"), "yeni veri");
    expect(migrateLegacyData({ userData, legacyDirs: [old] })).toEqual({ status: "none" });
    expect(fs.readFileSync(path.join(userData, "Local Storage", "leveldb", "000003.log"), "utf8")).toBe("yeni veri");
    expect(migrateLegacyData({ userData: path.join(root, "Bos"), legacyDirs: [path.join(root, "yok")] })).toEqual({ status: "none" });
  });
  it("kopya bozulursa (doğrulama tutmaz) aktarım reddedilir, yeni klasörde yarım veri kalmaz, eski veri sağlam", () => {
    const old = legacy("UstaServisTakip"), before = snapshot(old), userData = path.join(root, "Anatek");
    const corrupt = (from: string, to: string) => fs.writeFileSync(to, fs.readFileSync(from, "utf8") + "BOZUK");
    const r = migrateLegacyData({ userData, legacyDirs: [old], copy: corrupt });
    expect(r.status).toBe("failed");
    expect(hasData(userData)).toBe(false);
    expect(fs.existsSync(path.join(userData, ".migrating"))).toBe(false);
    expect(snapshot(old)).toEqual(before);
  });
  it("kopyalama yarıda kesilirse (disk dolu / kapanma) geri alınır", () => {
    const old = legacy("usta-servis-takip"), userData = path.join(root, "Anatek");
    let n = 0;
    const interrupted = (from: string, to: string) => { if (++n > 1) throw new Error("ENOSPC: yer kalmadı"); fs.copyFileSync(from, to); };
    const r = migrateLegacyData({ userData, legacyDirs: [old], copy: interrupted });
    expect(r).toMatchObject({ status: "failed" });
    expect((r as { error: string }).error).toContain("ENOSPC");
    expect(hasData(userData)).toBe(false);
    expect(hasData(old)).toBe(true);
  });
  it("tekrar çalıştırılınca (zaten aktarılmış) tekrar kopyalamaz; ilk bulunan eski klasörü kullanır", () => {
    const a = legacy("UstaServisTakip"); legacy("usta-servis-takip");
    const userData = path.join(root, "Anatek");
    expect(migrateLegacyData({ userData, legacyDirs: [a, path.join(root, "usta-servis-takip")] }).status).toBe("migrated");
    expect(migrateLegacyData({ userData, legacyDirs: [a] }).status).toBe("none");
  });
});
