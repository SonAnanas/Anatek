// Sürüm notlarından GitHub yayın metnini üretir (CI: node scripts/release-body.mjs > release-body.md).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseBody(source, version) {
  const start = source.indexOf(`version: "${version}"`);
  if (start < 0) throw new Error(`Sürüm notu yok: ${version}`);
  const title = /title: "([^"]*)"/.exec(source.slice(start))?.[1] ?? "";
  const a = source.indexOf("items: [", start), b = source.indexOf("] }", a);
  const items = [...source.slice(a, b).matchAll(/^\s*"(.*)",?\s*$/gm)].map((m) => { try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; } }); // kaynak koddaki kaçışları (\\\\ gibi) gerçek metne çevirir
  return `${title}\n\n${items.map((i) => "- " + i).join("\n")}\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  process.stdout.write(releaseBody(readFileSync("src/lib/release-notes.ts", "utf8"), version));
}
