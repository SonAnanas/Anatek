import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BUILD_INFO } from "@/lib/build-info";
import { checkForUpdate, getStoredUpdate, type UpdateState } from "@/lib/update-check";

const mb = (n: number) => (n / 1048576).toFixed(1);

/** Ayarlar > Hakkında: sürüm kontrolü, yeni sürüm bilgisi ve (Windows'ta) doğrulamalı güncelleme. */
export function UpdatePanel() {
  const [info, setInfo] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const canInstall = typeof window !== "undefined" && !!window.masaustu?.updateStart;
  const [owner, repoName] = BUILD_INFO.repo.split("/");
  const pageUrl = owner && repoName ? `https://${owner.toLowerCase()}.github.io/${repoName}/` : "";

  const check = async () => { setBusy(true); setResult(null); setInfo(await checkForUpdate()); setBusy(false); };
  const install = async () => {
    if (!window.confirm("Anatek şimdi kapanacak ve kurulum açılacak.\n\nKurulum “Anatek mevcut” diye sorduğunda EVET (verilerim saklansın) seçin. Verileriniz kurulumdan önce ayrıca güvenlik kopyasına alınır.\n\nDevam edilsin mi?")) return;
    setResult(null); setProgress({ received: 0, total: 0 });
    const off = window.masaustu?.onUpdateProgress?.((p) => setProgress(p));
    const r = await window.masaustu!.updateStart!(BUILD_INFO.repo);
    off?.(); setProgress(null);
    setResult(r.ok ? { ok: true, text: "Dosya doğrulandı (SHA-256). Kurulum açılıyor; Anatek birazdan kapanacak." } : { ok: false, text: r.message ?? "Güncelleme başarısız oldu. Mevcut uygulamanız değişmedi." });
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy || !!progress} onClick={check}>{busy ? "Kontrol ediliyor…" : "Güncelleme var mı?"}</Button>
        {info?.state === "newer" && canInstall && !progress && <Button onClick={install}>Güncelle ve kur</Button>}
        {info?.state === "newer" && !canInstall && pageUrl && <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">İndirme sayfasını aç</a>}
      </div>
      {info && (
        <div role="status" className="grid gap-1">
          <p>Yüklü: <b>{BUILD_INFO.version}</b> (derleme #{BUILD_INFO.build}){info.latest !== undefined && <> · Yayındaki: derleme <b>#{info.latest}</b>{info.publishedAt && <> · {new Date(info.publishedAt).toLocaleDateString("tr-TR")}</>}</>}</p>
          <p className={info.state === "newer" ? "font-semibold" : ""}>{info.state === "newer" && canInstall ? `Yeni sürüm var: derleme ${info.latest} (sizde ${BUILD_INFO.build}). “Güncelle ve kur” ile kurabilirsiniz; verileriniz korunur.` : info.message}</p>
          {info.state === "newer" && info.notes && (
            <details open><summary className="cursor-pointer text-sm font-semibold">Yeni sürümde neler var</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm">{info.notes}</pre></details>
          )}
        </div>
      )}
      {progress && (
        <div className="grid gap-1">
          <progress className="h-3 w-full" value={progress.received} max={progress.total || undefined} aria-label="İndirme ilerlemesi" />
          <span className="text-sm">İndiriliyor: {mb(progress.received)}{progress.total ? ` / ${mb(progress.total)}` : ""} MB</span>
          <div><Button variant="outline" size="sm" onClick={() => window.masaustu?.updateCancel?.()}>İptal</Button></div>
        </div>
      )}
      {result && <p role="status" className={result.ok ? "" : "font-semibold text-destructive"}>{result.text}</p>}
    </div>
  );
}

/** Genel bakışta "yeni sürüm var" uyarısı (günde en fazla iki kez arka planda kontrol edilir). */
export function UpdateBanner() {
  const [latest, setLatest] = useState<number | null>(null);
  useEffect(() => {
    const read = () => { const s = getStoredUpdate(); setLatest(s?.state === "newer" && /^\d+$/.test(BUILD_INFO.build) && (s.latest ?? 0) > Number(BUILD_INFO.build) ? s.latest! : null); };
    read();
    window.addEventListener("anatek-update", read);
    return () => window.removeEventListener("anatek-update", read);
  }, []);
  if (latest === null) return null;
  return <Link to="/ayarlar" className="rounded-md border-2 border-primary bg-card p-3 text-base font-semibold hover:border-foreground">Yeni sürüm var: derleme #{latest}. Ayarlar → Hakkında’dan güncelleyin.</Link>;
}
