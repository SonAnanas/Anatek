// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RELEASES } from "./release-notes";
// @ts-ignore: düz JavaScript betik
import { releaseBody } from "../../scripts/release-body.mjs";

const source = fs.readFileSync(path.resolve("src/lib/release-notes.ts"), "utf8");

describe("yayın metni (GitHub sürüm notu)", () => {
  it("her sürüm için başlık ve tüm maddeleri üretir", () => {
    for (const r of RELEASES) {
      const body = releaseBody(source, r.version) as string;
      const lines = body.trim().split("\n");
      expect(lines[0]).toBe(r.title);
      const bullets = lines.filter((l) => l.startsWith("- "));
      expect(bullets).toHaveLength(r.items.length);
      expect(bullets[0]).toBe("- " + r.items[0]);
    }
  });
  it("notu olmayan sürümde hata verir", () => { expect(() => releaseBody(source, "9.9.9")).toThrow(/Sürüm notu yok/); });
});
