import { hasLastDelete } from "@/lib/repository";
import { undoLastDeleteWithToast } from "@/components/DeleteButton";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputCls } from "@/components/Field";
import { useRepo } from "@/hooks/use-repo";
import { addStatus, deleteEmployee, deleteStatus, employeeUsed, getSmsSettings, listStatuses, maskSecret, repo, setSmsSetting } from "@/lib/repository";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { DataHealth } from "@/components/DataHealth";
import { ReleaseNotesDialog } from "@/components/ReleaseNotes";
import { UpdatePanel } from "@/components/UpdatePanel";
import { BUILD_INFO } from "@/lib/build-info";
import { checkConnection, sendTestSms, testSmsText } from "@/lib/sms-send";

export const Route = createFileRoute("/ayarlar")({
  head: () => ({
    meta: [
      { title: "Ayarlar — Anatek" },
      { name: "description", content: "İşletme bilgileri, SMS, çalışanlar ve servis durumları." },
      { property: "og:title", content: "Ayarlar — Anatek" },
      { property: "og:description", content: "İşletme bilgileri, SMS, çalışanlar ve servis durumları." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <section className="grid max-w-3xl gap-10">
      <h1 className="text-3xl font-bold">Ayarlar</h1>
      <SmsSettingsSection />
      <Employees />
      <Statuses />
      <LastDelete />
      <DataHealth />
      <About />
    </section>
  );
}

function Employees() {
  const { data } = useRepo(() => repo.employees.list({ includeArchived: true }), []);
  const [name, setName] = useState(""), [role, setRole] = useState("");
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-bold">Çalışanlar</h2>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; repo.employees.create({ name: name.trim(), role: role.trim() || undefined }); setName(""); setRole(""); }}>
        <Input aria-label="Çalışan adı" placeholder="Ad soyad" className={`${inputCls} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Görev" placeholder="Görev (ops.)" className={`${inputCls} max-w-xs`} value={role} onChange={(e) => setRole(e.target.value)} />
        <Button type="submit" className="h-11">Ekle</Button>
      </form>
      <ul className="grid gap-2">
        {data.map((e) => (
          <li key={e.id} className={`flex items-center gap-2 ${e.archived ? "opacity-60" : ""}`}>
            <Input aria-label="Çalışan adı" className={`${inputCls} max-w-xs`} defaultValue={e.name} disabled={employeeUsed(e.id)} title={employeeUsed(e.id) ? "Servislerde kullanılmış çalışanın adı değiştirilemez (eski kayıtlar bozulmasın). Arşivleyip yenisini ekleyin." : undefined} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.name) repo.employees.update(e.id, { name: v }); }} />
            <span className="w-32 text-muted-foreground">{e.role}</span>
            {e.archived
              ? <Button variant="outline" onClick={() => repo.employees.restore(e.id)}>Geri al</Button>
              : <Button variant="outline" onClick={() => repo.employees.archive(e.id)}>Arşivle</Button>}
            <Button variant="outline" className="text-destructive" onClick={() => { if (!window.confirm(`“${e.name}” kalıcı olarak silinsin mi?`)) return; try { deleteEmployee(e.id); toast.success("Silindi."); } catch (err) { toast.error(err instanceof Error ? err.message : "Silinemedi"); } }}>Sil</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const KIND: Record<string, string> = { active: "Aktif", completed: "Tamamlandı", delivered: "Teslim", cancelled: "İptal" };
function Statuses() {
  const { data } = useRepo(() => listStatuses(true), []);
  const [label, setLabel] = useState("");
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-bold">Servis durumları</h2>
      <p className="text-muted-foreground">Eklenen durumlar Kanban'da sütun olur. Temel durumlar silinemez ve arşivlenemez, adları değiştirilebilir. Eklediğin bir durumda hiç servis yoksa silebilirsin, varsa arşivlenir.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!label.trim()) return; addStatus(label); setLabel(""); }}>
        <Input aria-label="Yeni durum" placeholder="Örn. Parça bekleniyor" className={`${inputCls} max-w-xs`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" className="h-11">Durum ekle</Button>
      </form>
      <ul className="grid gap-2">
        {data.map((s) => (
          <li key={s.id} className={`flex items-center gap-2 ${s.archived ? "opacity-60" : ""}`}>
            <Input aria-label="Durum adı" className={`${inputCls} max-w-xs`} defaultValue={s.label} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== s.label) repo.serviceStatuses.update(s.id, { label: v }); }} />
            <span className="w-28 text-muted-foreground">{KIND[s.kind]}</span>
            {!s.builtin && (s.archived
              ? <Button variant="outline" onClick={() => repo.serviceStatuses.restore(s.id)}>Geri al</Button>
              : <Button variant="outline" onClick={() => repo.serviceStatuses.archive(s.id)}>Arşivle</Button>)}
            {!s.builtin && <Button variant="outline" className="text-destructive" onClick={() => { if (!window.confirm(`“${s.label}” durumu kalıcı olarak silinsin mi?`)) return; try { deleteStatus(s.id); toast.success("Silindi."); } catch (err) { toast.error(err instanceof Error ? err.message : "Silinemedi"); } }}>Sil</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SmsSettingsSection() {
  const { data, ready } = useRepo(getSmsSettings, { businessName: "", businessPhone: "", autoSms: true, simulateSuccess: true, apiKey: "", smsMode: "simulate", imKey: "", imHash: "", imSender: "" });
  const [key, setKey] = useState("");
  const [hash, setHash] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<{ ok: boolean; text: string; senders: string[] } | null>(null);
  if (!ready) return null;
  const text = (k: "businessName" | "businessPhone" | "imSender", label: string) => (
    <label className="grid gap-1"><span className="text-base font-medium">{label}</span>
      <Input className={`${inputCls} max-w-md`} defaultValue={data[k]} onBlur={(e) => setSmsSetting(k, e.target.value.trim())} /></label>
  );
  const sw = (k: "autoSms" | "simulateSuccess", label: string, desc: string) => (
    <label className="flex items-center gap-3"><Switch checked={data[k]} onCheckedChange={(v) => setSmsSetting(k, v)} />
      <span><span className="text-base font-medium">{label}</span><span className="block text-sm text-muted-foreground">{desc}</span></span></label>
  );
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold">İşletme ve SMS</h2>
      {text("businessName", "İşletme adı (menüde “Anatek - İşletme adı” olarak görünür)")}
      {text("businessPhone", "İşletme telefonu")}
      {sw("autoSms", "Otomatik SMS", "Servis Tamamlandı olunca mesaj önizlemesi gösterilir.")}
      <label className="flex items-center gap-3"><Switch checked={data.smsMode === "iletimerkezi"} onCheckedChange={(v) => setSmsSetting("smsMode", v ? "iletimerkezi" : "simulate")} />
        <span><span className="text-base font-medium">Gerçek SMS gönder (İleti Merkezi)</span>
          <span className="block text-sm text-muted-foreground">Kapalıyken gönderim simüle edilir, hiçbir SMS gitmez ve kontör harcanmaz. Gerçek gönderim yalnızca Android ve Windows uygulamasında çalışır.</span></span></label>
      {data.smsMode === "simulate" && sw("simulateSuccess", `Simülasyon sonucu: ${data.simulateSuccess ? "başarılı" : "başarısız"}`, "Simülasyon açıkken sonuç bu anahtara göre kaydedilir.")}
      {data.smsMode === "iletimerkezi" && (
        <div className="grid gap-3 rounded-md border p-4">
          {text("imSender", "Gönderici başlığı (firmanın onayladığı başlık)")}
          <p className="-mt-2 text-sm text-muted-foreground">Başlık onayı 1-2 iş günü sürer. Onay çıkana kadar <b>APITEST</b> yazabilirsiniz; bu durumda mesaj metni sabit bir deneme metni olur. Onay çıkınca APITEST çalışmaz, onaylı başlığı yazın.</p>
          <div className="grid gap-1">
            <span className="text-base font-medium">API anahtarı ve Hash (panel: Ayarlar &gt; Güvenlik &gt; API Erişimi)</span>
            <span className="text-sm text-muted-foreground">Kayıtlı anahtar: {data.imKey ? maskSecret(data.imKey) : "yok"} · Hash: {data.imHash ? maskSecret(data.imHash) : "yok"} · Bu cihazda saklanır, yedek dosyasına konmaz.</span>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) setSmsSetting("imKey", key.trim()); if (hash.trim()) setSmsSetting("imHash", hash.trim()); setKey(""); setHash(""); toast.success("Kaydedildi."); }}>
              <Input type="password" autoComplete="off" aria-label="API anahtarı" placeholder="API anahtarı" className={`${inputCls} max-w-xs`} value={key} onChange={(e) => setKey(e.target.value)} />
              <Input type="password" autoComplete="off" aria-label="Hash" placeholder="Hash" className={`${inputCls} max-w-xs`} value={hash} onChange={(e) => setHash(e.target.value)} />
              <Button type="submit" className="h-11">Kaydet</Button>
            </form>
          </div>
          <div className="grid gap-1">
            <span className="text-base font-medium">Bağlantı kontrolü (kontör harcamaz, SMS göndermez)</span>
            <span className="text-sm text-muted-foreground">Anahtarları kaydettikten sonra önce bunu deneyin: kimlik doğrulamayı, bakiyeyi ve onaylı başlıkları kontrol eder.</span>
            <div><Button type="button" variant="outline" className="h-11" disabled={busy} onClick={async () => {
              setBusy(true); setConn(null);
              const r = await checkConnection(); setBusy(false);
              if (!r.ok) { setConn({ ok: false, text: r.error, senders: [] }); return; }
              const s = getSmsSettings().imSender.trim();
              const bal = r.balanceTry !== null ? `Bakiye: ${r.balanceTry.toLocaleString("tr-TR")} TL${r.smsEstimate !== null ? ` (yaklaşık ${r.smsEstimate} SMS)` : ""}. ` : "";
              let note = r.senders.length ? `Onaylı başlıklar: ${r.senders.join(", ")}.` : "Onaylı başlık yok; onay bekleniyorsa başlığa APITEST yazabilirsiniz.";
              if (r.senders.length && s.toUpperCase() === "APITEST") note += " Dikkat: onaylı başlığınız var, APITEST artık çalışmaz; aşağıdan onaylı başlığı seçin.";
              else if (r.senders.length && s && !r.senders.includes(s)) note += " Dikkat: yazdığınız başlık onaylı listede yok.";
              setConn({ ok: true, text: `Bağlantı başarılı. ${bal}${note}`, senders: r.senders });
            }}>{busy ? "Kontrol ediliyor…" : "Bağlantıyı test et"}</Button></div>
            {conn && <p role="status" className={`text-base ${conn.ok ? "" : "font-semibold text-destructive"}`}>{conn.text}</p>}
            {conn?.senders.length ? <div className="flex flex-wrap gap-2">{conn.senders.map((s) => <Button key={s} type="button" variant="outline" onClick={() => { setSmsSetting("imSender", s); toast.success(`Başlık: ${s}`); }}>Başlık olarak kullan: {s}</Button>)}</div> : null}
          </div>
          <div className="grid gap-1">
            <span className="text-base font-medium">Test SMS</span>
            <span className="text-sm text-muted-foreground">Kendi telefon numaranıza “TEST …” ile başlayan bir deneme mesajı gönderir; her seferinde farklıdır. Kontör harcanır. Başka birinin numarasını yazmayın.</span>
            <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await sendTestSms(testPhone, testSmsText()); setBusy(false); if (r.ok) toast.success("Test SMS gönderildi."); else toast.error(r.error); }}>
              <Input aria-label="Test telefonu" placeholder="05XX XXX XX XX" className={`${inputCls} max-w-xs`} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button type="submit" className="h-11" disabled={busy || !testPhone.trim()}>{busy ? "Gönderiliyor…" : "Test SMS gönder"}</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function About() {
  const [notes, setNotes] = useState(false);
  const where = typeof window === "undefined" ? "" : window.masaustu ? "Windows uygulaması" : Capacitor.isNativePlatform() ? "Android uygulaması" : "Tarayıcı";
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-bold">Hakkında</h2>
      <p>Anatek · Sürüm <b>{BUILD_INFO.version}</b> · Derleme <b>#{BUILD_INFO.build}</b>{BUILD_INFO.commit && <> ({BUILD_INFO.commit})</>}</p>
      <p>Geliştirici: <b>SonAnanas</b></p>
      <p className="text-sm text-muted-foreground">Derlenme: {new Date(BUILD_INFO.builtAt).toLocaleString("tr-TR")} · {where}</p>
      <UpdatePanel />
      <div><Button variant="outline" onClick={() => setNotes(true)}>Sürüm notları</Button></div>
      <ReleaseNotesDialog open={notes} onOpenChange={setNotes} />
    </div>
  );
}

function LastDelete() {
  const { data: has } = useRepo(() => hasLastDelete(), false);
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-bold">Son silme</h2>
      <p className="text-muted-foreground">En son kalıcı olarak silinen kaydı ve bağlı kayıtlarını geri getirir.</p>
      <div><Button variant="outline" disabled={!has} onClick={undoLastDeleteWithToast}>Son silmeyi geri al</Button></div>
    </div>
  );
}
