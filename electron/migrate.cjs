// Eski sürümlerin veri klasöründen (UstaServisTakip, usta-servis-takip) güvenli aktarım.
// Kurallar: eski klasör ASLA silinmez/değiştirilmez; her dosya kopyalandıktan sonra boyut ve SHA-256 ile doğrulanır;
// hata veya kesinti olursa yeni klasörde yarım veri bırakılmaz (eski veri olduğu gibi kalır).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIRS = ["Local Storage", "IndexedDB"];

const dirHasFiles = (d) => { try { return fs.readdirSync(d).length > 0; } catch { return false; } };
/** Klasörde uygulama verisi (Local Storage / IndexedDB) var mı? */
const hasData = (dir) => DATA_DIRS.some((n) => dirHasFiles(path.join(dir, n)));

function listFiles(root, base = root, out = []) {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else out.push({ rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return out;
}
function sha256File(p) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(p, "r"), buf = Buffer.allocUnsafe(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return h.digest("hex");
}
/** src klasörünü dest'e kopyalar ve her dosyayı doğrular. copy: test için enjekte edilebilir. */
function copyVerified(src, dest, copy = fs.copyFileSync) {
  let files = 0, bytes = 0;
  for (const f of listFiles(src)) {
    const from = path.join(src, f.rel), to = path.join(dest, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copy(from, to);
    if (fs.statSync(to).size !== f.size || sha256File(to) !== sha256File(from)) throw new Error(`Doğrulama hatası: ${f.rel}`);
    files++; bytes += f.size;
  }
  return { files, bytes };
}

/**
 * Yeni klasörde veri yoksa ve eski klasörlerden birinde varsa aktarır.
 * @returns {{status:"none"} | {status:"migrated", from:string, files:number, bytes:number} | {status:"failed", from:string, error:string}}
 */
function migrateLegacyData({ userData, legacyDirs, copy, now = () => new Date().toISOString() }) {
  if (hasData(userData)) return { status: "none" };
  const from = legacyDirs.find((d) => d !== userData && hasData(d));
  if (!from) return { status: "none" };
  const tmp = path.join(userData, ".migrating"), moved = [];
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    let files = 0, bytes = 0;
    for (const n of DATA_DIRS) {
      const src = path.join(from, n);
      if (!fs.existsSync(src)) continue;
      const r = copyVerified(src, path.join(tmp, n), copy);
      files += r.files; bytes += r.bytes;
    }
    for (const n of DATA_DIRS) {
      const staged = path.join(tmp, n);
      if (!fs.existsSync(staged)) continue;
      const dest = path.join(userData, n);
      fs.rmSync(dest, { recursive: true, force: true }); // yeni klasörde boş kalıntı olabilir
      fs.renameSync(staged, dest);
      moved.push(dest);
    }
    fs.writeFileSync(path.join(userData, "migrated-from.json"), JSON.stringify({ from, at: now(), files, bytes }));
    fs.rmSync(tmp, { recursive: true, force: true });
    return { status: "migrated", from, files, bytes };
  } catch (e) {
    for (const d of moved) fs.rmSync(d, { recursive: true, force: true }); // yarım aktarımı geri al
    fs.rmSync(tmp, { recursive: true, force: true });
    return { status: "failed", from, error: String((e && e.message) || e) };
  }
}
module.exports = { migrateLegacyData, hasData, copyVerified, sha256File };
