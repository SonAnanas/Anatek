import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRepo } from "@/hooks/use-repo";
import { backupMeta } from "@/lib/repository";
import {
  applyRestore, backupFileName, BackupError, createBackup, parseBackupFile, prepareRestore, takeSafetySnapshot, undoLastRestore,
  TABLE_LABELS, type BackupFile, type PreparedRestore,
} from "@/lib/backup";
import { formatDate } from "@/lib/format";
import type { EntityName } from "@/lib/types";

export const Route = createFileRoute("/yedekleme")({
  head: () => ({
    meta: [
      { title: "Veri yedekleme — Anatek" },
      { name: "description", content: "Tarayıcıdaki verileri yedek dosyasına alın ve geri yükleyin." },
      { property: "og:title", content: "Veri yedekleme — Anatek" },
      { property: "og:description", content: "Tarayıcıdaki verileri yedek dosyasına alın ve geri yükleyin." },
    ],
  }),
  component: BackupPage,
});

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const errMsg = (e: unknown) => (e instanceof BackupError ? e.message : "Beklenmeyen bir hata oluştu. Mevcut veriler korundu.");
const DAY = 86_400_000;

type Step = { label: string; state: "ok" | "fail" | "wait" };

function BackupPage() {
  const { data: meta } = useRepo(() => ({ last: backupMeta.getLastBackupAt(), snap: !!backupMeta.getSnapshot() }), { last: null as string | null, snap: false });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<BackupFile | null>(null);
  const [restorePw, setRestorePw] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null);
  const [snapDone, setSnapDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const stale = !meta.last || Date.now() - new Date(meta.last).getTime() > 7 * DAY;
  const addStep = (s: Step) => setSteps((p) => [...p, s]);
  const resetRestore = () => { setFileText(null); setFileInfo(null); setSteps([]); setPrepared(null); setSnapDone(false); setConfirmed(false); setResult(null); setRestorePw(""); if (fileRef.current) fileRef.current.value = ""; };

  async function run(fn: () => Promise<void>) { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } }

  const onCreate = () => run(async () => {
    setMsg(null);
    try {
      const text = await createBackup(pw);
      download(backupFileName(), text);
      backupMeta.setLastBackupAt(new Date().toISOString());
      setMsg({ ok: true, text: pw ? "Şifreli yedek oluşturuldu ve indirildi." : "Yedek oluşturuldu ve indirildi." });
      setPw("");
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }); }
  });

  const onFile = (f: File | undefined) => run(async () => {
    resetRestore();
    if (!f) return;
    const text = await f.text();
    setFileText(text);
    addStep({ label: `a. Dosya seçildi: ${f.name}`, state: "ok" });
    try {
      const info = parseBackupFile(text);
      setFileInfo(info);
      addStep({ label: `b. Dosya biçimi geçerli${info.encrypted ? " — yedek şifreli, parola gerekli" : ""}`, state: "ok" });
      if (!info.encrypted) await verify(text, "");
    } catch (e) { addStep({ label: `b. ${errMsg(e)}`, state: "fail" }); }
  });

  async function verify(text: string, password: string) {
    try {
      const p = await prepareRestore(text, password);
      addStep({ label: "c. Bütünlük kontrolü (SHA-256) tuttu", state: "ok" });
      addStep({ label: `d. Şema sürümü uygun (${p.file.schemaVersion})`, state: "ok" });
      addStep({ label: "e. Tüm kayıt ilişkileri tam", state: "ok" });
      addStep({ label: "f. Özet hazır — aşağıda karşılaştırın", state: "ok" });
      setPrepared(p);
    } catch (e) { addStep({ label: errMsg(e), state: "fail" }); }
  }

  const onPassword = () => run(async () => {
    if (!fileText) return;
    setSteps((s) => s.filter((x) => x.label.startsWith("a.") || x.label.startsWith("b.")));
    await verify(fileText, restorePw);
  });

  const onSnapshot = () => run(async () => {
    try {
      const { text, stored } = await takeSafetySnapshot();
      download(backupFileName().replace("Backup", "Guvenlik_Kopyasi"), text);
      if (!stored) { addStep({ label: "g. Güvenlik kopyası indirildi ama tarayıcıya kaydedilemedi (depolama dolu). İndirilen dosyayı saklayın.", state: "fail" }); }
      else addStep({ label: "g. Mevcut verinin güvenlik kopyası indirildi ve tarayıcıda saklandı", state: "ok" });
      setSnapDone(true);
    } catch (e) { addStep({ label: `g. Güvenlik kopyası alınamadı: ${errMsg(e)}`, state: "fail" }); }
  });

  const onApply = () => run(async () => {
    if (!prepared) return;
    try {
      const n = applyRestore(prepared.data);
      addStep({ label: "i. Veriler tek seferde yüklendi", state: "ok" });
      setResult({ ok: true, text: `Geri yükleme başarılı: ${n} kayıt yüklendi.` });
    } catch (e) {
      addStep({ label: "i. Yükleme başarısız", state: "fail" });
      setResult({ ok: false, text: `Geri yükleme başarısız. ${errMsg(e)}` });
    }
  });

  const onUndo = () => run(async () => {
    if (!window.confirm("Mevcut veriler, son geri yüklemeden önceki güvenlik kopyasıyla değiştirilecek. Devam edilsin mi?")) return;
    try { const n = await undoLastRestore(); setMsg({ ok: true, text: `Son geri yükleme geri alındı: ${n} kayıt yüklendi.` }); }
    catch (e) { setMsg({ ok: false, text: errMsg(e) }); }
  });

  const needPw = fileInfo?.encrypted && !prepared && fileText;

  return (
    <section className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Veri yedekleme</h1>
        <p className="mt-2 text-lg text-muted-foreground">Tüm veriler (arşivliler dahil) tek dosyaya alınır. API anahtarı yedeğe konmaz.</p>
      </div>

      <div className="rounded-lg border-2 p-6 space-y-4">
        <h2 className="text-2xl font-bold">Yedek oluştur</h2>
        <p className="text-lg">Son yedek: <b>{meta.last ? formatDate(meta.last) : "Hiç alınmadı"}</b></p>
        {stale && <p className="rounded-md border-2 border-destructive p-3 text-lg font-semibold text-destructive">{meta.last ? "Son yedek 7 günden eski. Lütfen yeni yedek alın." : "Henüz hiç yedek alınmadı. Lütfen yedek alın."}</p>}
        <label className="block text-lg">Parola (isteğe bağlı — boş bırakılırsa şifresiz)
          <Input type="password" className="mt-1 h-12 text-lg" value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} autoComplete="new-password" />
        </label>
        <Button size="lg" className="h-14 text-lg" onClick={onCreate} disabled={busy}>Yedek Oluştur</Button>
        {msg && <p className={`text-lg font-semibold ${msg.ok ? "" : "text-destructive"}`}>{msg.text}</p>}
      </div>

      <div className="rounded-lg border-2 p-6 space-y-4">
        <h2 className="text-2xl font-bold">Yedekten geri yükle</h2>
        <input ref={fileRef} type="file" accept=".backup,application/json" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="block text-lg" aria-label="Yedek dosyası seç" />

        {steps.length > 0 && (
          <ol className="space-y-1 text-lg">
            {steps.map((s, i) => <li key={i} className={`whitespace-pre-line ${s.state === "fail" ? "font-semibold text-destructive" : ""}`}>{s.state === "ok" ? "✓ " : s.state === "fail" ? "✗ " : "• "}{s.label}</li>)}
          </ol>
        )}

        {needPw && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-lg">Yedek parolası
              <Input type="password" className="mt-1 h-12 text-lg" value={restorePw} onChange={(e) => setRestorePw(e.target.value)} disabled={busy} />
            </label>
            <Button size="lg" className="h-12 text-lg" onClick={onPassword} disabled={busy || !restorePw}>Parolayı doğrula</Button>
          </div>
        )}

        {prepared && (
          <>
            <p className="text-lg">Yedeğin tarihi: <b>{formatDate(prepared.file.createdAt)}</b></p>
            <table className="w-full border-2 text-lg">
              <thead><tr className="border-b-2"><th className="p-2 text-left">Tablo</th><th className="p-2 text-right">Yedekte</th><th className="p-2 text-right">Şu an</th></tr></thead>
              <tbody>
                {(Object.keys(TABLE_LABELS) as EntityName[]).map((t) => (
                  <tr key={t} className="border-b"><td className="p-2">{TABLE_LABELS[t]}</td><td className="p-2 text-right">{prepared.backupCounts[t]}</td><td className="p-2 text-right">{prepared.currentCounts[t]}</td></tr>
                ))}
              </tbody>
            </table>
            {!result && !snapDone && <Button size="lg" className="h-14 text-lg" onClick={onSnapshot} disabled={busy}>g. Mevcut verinin güvenlik kopyasını al</Button>}
            {!result && snapDone && (
              <div className="space-y-3 rounded-md border-2 border-destructive p-4">
                <label className="flex items-center gap-3 text-lg font-semibold">
                  <input type="checkbox" className="h-6 w-6" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
                  h. Mevcut veriler yedekteki verilerle değiştirilecek. Onaylıyorum.
                </label>
                <Button size="lg" variant="destructive" className="h-14 text-lg" onClick={onApply} disabled={busy || !confirmed}>Geri yüklemeyi başlat</Button>
              </div>
            )}
          </>
        )}
        {result && <p className={`text-xl font-bold ${result.ok ? "" : "text-destructive"}`}>j. {result.text}</p>}
        {steps.length > 0 && <Button variant="outline" size="lg" onClick={resetRestore} disabled={busy}>Temizle</Button>}
      </div>

      <div className="rounded-lg border-2 p-6 space-y-3">
        <h2 className="text-2xl font-bold">Son geri yüklemeyi geri al</h2>
        <p className="text-lg text-muted-foreground">Son geri yüklemeden önce alınan güvenlik kopyasına döner.</p>
        <Button size="lg" variant="outline" className="h-14 text-lg" onClick={onUndo} disabled={busy || !meta.snap}>Son geri yüklemeyi geri al</Button>
      </div>
    </section>
  );
}
