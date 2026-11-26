// Güvenli güncelleme indirme: önce SHA256SUMS dosyası okunur, kurulum dosyası indirilir, SHA-256 doğrulanır.
// Doğrulanamayan dosya silinir ve ASLA çalıştırılmaz. İnternet kesintisi, disk yetersizliği ve iptal ele alınır.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mb = (n) => Math.ceil(n / 1048576);
const fail = (code, message) => Object.assign(new Error(message), { code });
const NETWORK_MSG = "İnternet bağlantısı kesildi veya sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin. Mevcut uygulamanız ve verileriniz değişmedi.";
const mapNet = (e) => (e && (e.name === "AbortError" || e.code === "CANCELLED") ? fail("CANCELLED", "İptal edildi.") : e && e.code ? e : fail("NETWORK", NETWORK_MSG));

/** "hash  dosya" ve "hash *dosya" biçimlerini okur. */
function parseSums(text) {
  const m = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const x = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (x) m.set(x[2], x[1].toLowerCase());
  }
  return m;
}

async function downloadAndVerify({ url, sumsUrl, assetName, destDir, onProgress = () => {}, signal, fetchImpl = fetch, statfs = (d) => fs.statfsSync(d), minFree = 50 * 1048576 }) {
  fs.mkdirSync(destDir, { recursive: true });
  const part = path.join(destDir, assetName + ".part"), final = path.join(destDir, assetName);
  for (const f of [part, final]) fs.rmSync(f, { force: true }); // eski/yarım kalıntıları temizle

  let expected;
  try {
    const r = await fetchImpl(sumsUrl, { signal });
    if (!r.ok) throw fail("SUMS", `Doğrulama dosyası (SHA256SUMS) alınamadı (hata ${r.status}). Güvenlik için indirilmedi.`);
    expected = parseSums(await r.text()).get(assetName);
  } catch (e) { throw mapNet(e); }
  if (!expected) throw fail("SUMS", "Doğrulama dosyası bu kurulum dosyasını içermiyor. Güvenlik için indirilmedi.");

  let res;
  try { res = await fetchImpl(url, { signal }); } catch (e) { throw mapNet(e); }
  if (!res.ok) throw fail("HTTP", `Sunucu hata verdi (${res.status}). Daha sonra tekrar deneyin.`);
  const total = Number(res.headers.get("content-length")) || 0;
  const st = statfs(destDir), free = Number(st.bavail) * Number(st.bsize);
  if (total && free < total * 2 + minFree) throw fail("DISK", `Yetersiz disk alanı: yaklaşık ${mb(total * 2 + minFree)} MB gerekli, ${mb(free)} MB boş. Yer açıp tekrar deneyin.`);

  const hash = crypto.createHash("sha256"), fd = fs.openSync(part, "w");
  let received = 0, closed = false;
  const closeFd = () => { if (!closed) { closed = true; fs.closeSync(fd); } };
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      fs.writeSync(fd, value); hash.update(value); received += value.length;
      onProgress({ received, total });
    }
  } catch (e) { closeFd(); fs.rmSync(part, { force: true }); throw mapNet(e); }
  closeFd();
  if (total && received !== total) { fs.rmSync(part, { force: true }); throw fail("NETWORK", NETWORK_MSG); }
  const actual = hash.digest("hex");
  if (actual !== expected) { fs.rmSync(part, { force: true }); throw fail("HASH", "İndirilen dosya bozuk (SHA-256 doğrulaması tutmadı). Dosya silindi ve çalıştırılmadı. Tekrar deneyin."); }
  fs.renameSync(part, final);
  return { file: final, sha256: actual, bytes: received };
}
module.exports = { downloadAndVerify, parseSums };
