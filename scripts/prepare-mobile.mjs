// SPA kabuğunu Capacitor'un bekledigi index.html olarak kopyalar.
import { copyFileSync, existsSync } from "node:fs";
const dir = ".output/public";
if (!existsSync(`${dir}/_shell.html`)) { console.error("_shell.html bulunamadi: SPA derlemesi basarisiz."); process.exit(1); }
copyFileSync(`${dir}/_shell.html`, `${dir}/index.html`);
console.log("Mobil derleme hazir:", dir);
