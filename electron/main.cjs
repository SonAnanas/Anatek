// Windows masaustu kabugu: uygulamayi yerel dosyalardan, internetsiz calistirir.
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { migrateLegacyData } = require("./migrate.cjs");
const { downloadAndVerify } = require("./updater.cjs");

// Sabit "app://local" adresi: veriler (localStorage) her acilista ayni yerde kalir.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const root = path.join(__dirname, "..", ".output", "public");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// SMS isteği: tarayıcı kısıtına (CORS) takılmamak için ana süreçten, yalnızca İleti Merkezi adresine gider.
ipcMain.handle("quit", () => app.quit());
ipcMain.handle("http-post", async (_e, url, body) => {
  if (!String(url).startsWith("https://api.iletimerkezi.com/")) throw new Error("İzin verilmeyen adres");
  const r = await net.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  return { status: r.status, text: await r.text() };
});

// Güncelleme: kurulum dosyası YALNIZCA bu deponun yayınından indirilir, SHA-256 doğrulanmadan çalıştırılmaz.
let updateAbort = null;
ipcMain.handle("update:cancel", () => { if (updateAbort) updateAbort.abort(); });
ipcMain.handle("update:start", async (e, repo) => {
  if (updateAbort) return { ok: false, message: "Bir indirme zaten sürüyor." };
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo))) return { ok: false, message: "Depo bilgisi geçersiz." };
  updateAbort = new AbortController();
  const signal = updateAbort.signal;
  try {
    const r = await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, { signal, headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return { ok: false, message: `Son sürüm bilgisi alınamadı (hata ${r.status}).` };
    const rel = await r.json();
    const find = (n) => (rel.assets || []).find((a) => a.name === n)?.browser_download_url;
    const url = find("Anatek-Kurulum.exe"), sumsUrl = find("SHA256SUMS.txt"), prefix = `https://github.com/${repo}/releases/download/`;
    if (!url || !sumsUrl || !url.startsWith(prefix) || !sumsUrl.startsWith(prefix)) return { ok: false, message: "Kurulum dosyası veya doğrulama dosyası yayında bulunamadı. Güvenlik için indirilmedi." };
    const res = await downloadAndVerify({ url, sumsUrl, assetName: "Anatek-Kurulum.exe", destDir: path.join(app.getPath("temp"), "Anatek-Guncelleme"), signal, fetchImpl: net.fetch, onProgress: (p) => e.sender.send("update:progress", p) });
    const err = await shell.openPath(res.file); // başarıda boş metin döner
    if (err) return { ok: false, message: `Kurulum dosyası açılamadı: ${err}` };
    setTimeout(() => app.quit(), 1500); // kurulum, çalışan uygulamayı kapatmak zorunda kalmasın
    return { ok: true, sha256: res.sha256 };
  } catch (err) {
    if (err && (err.code === "CANCELLED" || err.name === "AbortError")) return { ok: false, cancelled: true, message: "İptal edildi. Mevcut uygulamanız değişmedi." };
    return { ok: false, message: err && err.code ? err.message : "Güncelleme başarısız oldu (internet bağlantısını kontrol edin). Mevcut uygulamanız ve verileriniz değişmedi." };
  } finally { updateAbort = null; }
});

if (gotLock) app.whenReady().then(() => {
  // Eski sürümlerin veri klasörü varsa, pencere açılmadan ÖNCE doğrulanarak aktarılır (eski klasör silinmez).
  const mig = migrateLegacyData({ userData: app.getPath("userData"), legacyDirs: ["UstaServisTakip", "usta-servis-takip"].map((n) => path.join(app.getPath("appData"), n)) });
  protocol.handle("app", (req) => {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) return new Response("", { status: 403 });
    // Dosya yoksa tek sayfa uygulama gibi index.html'e dus
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 900, minHeight: 600, autoHideMenuBar: true, title: "Anatek", webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true } });
  win.loadURL("app://local/");
  if (mig.status === "migrated") dialog.showMessageBox(win, { type: "info", title: "Anatek", message: "Eski Anatek verileriniz bulundu ve aktarıldı.", detail: `${mig.files} dosya aktarıldı ve tek tek doğrulandı.\nEski klasör silinmedi:\n${mig.from}` });
  if (mig.status === "failed") dialog.showMessageBox(win, { type: "warning", title: "Anatek", message: "Eski Anatek verileri aktarılamadı.", detail: `Eski verileriniz olduğu gibi duruyor:\n${mig.from}\n\nNeden: ${mig.error}\n\nAnatek şimdilik boş veriyle açıldı. Yeni kayıt girmeden önce eski yedek dosyanızı Veri yedekleme sayfasından geri yükleyebilirsiniz.` });
});

app.on("second-instance", () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on("window-all-closed", () => app.quit());
