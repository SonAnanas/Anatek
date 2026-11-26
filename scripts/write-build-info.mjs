// Derleme bilgisini src/lib/build-info.ts dosyasına yazar (sürüm, derleme numarası, tarih, GitHub deposu).
import { readFileSync, writeFileSync } from "node:fs";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
// Sürüm notu eklenmeden yeni sürüm derlenmesin.
if (!readFileSync("src/lib/release-notes.ts", "utf8").includes(`version: "${version}"`)) {
  console.error(`HATA: src/lib/release-notes.ts içinde ${version} sürümünün notu yok. Önce sürüm notunu ekleyin.`);
  process.exit(1);
}
const info = {
  version,
  build: process.env.GITHUB_RUN_NUMBER || "yerel",
  commit: (process.env.GITHUB_SHA || "").slice(0, 7),
  builtAt: new Date().toISOString(),
  repo: process.env.GITHUB_REPOSITORY || "",
};
writeFileSync("src/lib/build-info.ts", `// Otomatik üretilir (scripts/write-build-info.mjs). Elle düzenlemeyin.\nexport const BUILD_INFO = ${JSON.stringify(info, null, 2)} as const;\n`);
console.log("Derleme bilgisi:", info.version, "derleme", info.build);
