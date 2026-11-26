import { describe, expect, it } from "vitest";
import { formatPhoneInput } from "./format";
import { createSubmitGuard } from "./use-submit-guard";
import { RELEASES } from "./release-notes";
import { BUILD_INFO } from "./build-info";

describe("telefon biçimi", () => {
  it("farklı yazımları aynı biçime getirir", () => {
    for (const x of ["5321112233", "05321112233", "+90 532 111 22 33", "905321112233", "0532-111-22-33", "(0532) 111 22 33"]) expect(formatPhoneInput(x)).toBe("0532 111 22 33");
  });
  it("yazarken kısmi girişleri bozmaz, fazlasını keser, yabancı numaraya dokunmaz", () => {
    expect(formatPhoneInput("0532111")).toBe("0532 111");
    expect(formatPhoneInput("0")).toBe("0");
    expect(formatPhoneInput("")).toBe("");
    expect(formatPhoneInput("053211122334455")).toBe("0532 111 22 33");
    expect(formatPhoneInput("+49 151 234")).toBe("+49 151 234");
    expect(formatPhoneInput("0212 444 55 66")).toBe("0212 444 55 66");
  });
  it("tekrar uygulanınca değişmez", () => {
    for (const x of ["5", "53", "5321", "53211", "5321112", "+90 5", "9053"]) expect(formatPhoneInput(formatPhoneInput(x))).toBe(formatPhoneInput(x));
  });
});

describe("çift tıklama koruması", () => {
  it("süre dolmadan ikinci gönderimi yok sayar, sonra yine izin verir", () => {
    let t = 1000, n = 0;
    const guard = createSubmitGuard(1200, () => t);
    expect(guard(() => n++)).toBe(true);
    t += 100; expect(guard(() => n++)).toBe(false);
    t += 1000; expect(guard(() => n++)).toBe(false);
    t += 200; expect(guard(() => n++)).toBe(true);
    expect(n).toBe(2);
  });
});

describe("sürüm notları", () => {
  it("güncel sürüm en üstte, sürümler tekil ve notları dolu", () => {
    expect(RELEASES[0]!.version).toBe(BUILD_INFO.version);
    expect(new Set(RELEASES.map((r) => r.version)).size).toBe(RELEASES.length);
    for (const r of RELEASES) { expect(r.items.length).toBeGreaterThan(0); expect(r.title.length).toBeGreaterThan(0); }
    expect(RELEASES.map((r) => r.version)).toEqual(["1.2.6", "1.2.5", "1.2.4", "1.2.3", "1.2.2", "1.2.1", "1.2", "1.1", "1.0"]);
  });
});
