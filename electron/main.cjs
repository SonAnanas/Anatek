// Windows masaustu kabugu: uygulamayi yerel dosyalardan, internetsiz calistirir.
const { app, BrowserWindow, protocol, net, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// Sabit "app://local" adresi: veriler (localStorage) her acilista ayni yerde kalir.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const root = path.join(__dirname, "..", ".output", "public");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// SMS isteği: tarayıcı kısıtına (CORS) takılmamak için ana süreçten, yalnızca İleti Merkezi adresine gider.
ipcMain.handle("http-post", async (_e, url, body) => {
  if (!String(url).startsWith("https://api.iletimerkezi.com/")) throw new Error("İzin verilmeyen adres");
  const r = await net.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  return { status: r.status, text: await r.text() };
});

if (gotLock) app.whenReady().then(() => {
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
});

app.on("second-instance", () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on("window-all-closed", () => app.quit());
