import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { inputCls } from "@/components/Field";
import { SmsCounter } from "@/components/SmsCounter";
import { useRepo } from "@/hooks/use-repo";
import { retryOrderSms } from "@/lib/sms-send";
import { archiveTemplate, ensureDefaultTemplate, fillTemplate, repo, resetDefaultTemplate, SAMPLE_VARS, SMS_VARIABLES, DEFAULT_SMS_TEMPLATE } from "@/lib/repository";
import { displayPlate, formatDate } from "@/lib/format";
import type { SmsLog, SmsTemplate } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/sms")({
  head: () => ({
    meta: [
      { title: "SMS geçmişi — Anatek" },
      { name: "description", content: "SMS şablonları ve müşterilere gönderilen mesajların geçmişi." },
      { property: "og:title", content: "SMS geçmişi — Anatek" },
      { property: "og:description", content: "SMS şablonları ve müşterilere gönderilen mesajların geçmişi." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <section className="grid gap-10">
      <h1 className="text-3xl font-bold">SMS</h1>
      <p className="-mt-8 text-muted-foreground">Gönderim simülasyondur; gerçek SMS gönderilmez.</p>
      <Templates />
      <History />
    </section>
  );
}

function Templates() {
  const { data } = useRepo(() => { ensureDefaultTemplate(); return repo.smsTemplates.list({ includeArchived: true }).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)); }, [] as SmsTemplate[]);
  const [edit, setEdit] = useState<{ id?: string; name: string; body: string } | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <h2 className="mr-auto text-xl font-bold">Şablonlar</h2>
        <Button size="lg" onClick={() => setEdit({ name: "", body: "" })}>Yeni şablon</Button>
      </div>
      {edit && <TemplateEditor value={edit} onDone={() => setEdit(null)} />}
      <ul className="grid gap-2">
        {data.map((t) => (
          <li key={t.id} className={`grid gap-2 rounded-md border-2 p-3 ${t.archived ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <b className="mr-auto text-lg">{t.name}{t.isDefault && " (varsayılan)"}{t.archived && " — arşivde"}</b>
              <Button variant="outline" onClick={() => setEdit({ id: t.id, name: t.name, body: t.body })}>Düzenle</Button>
              {t.isDefault && <Button variant="outline" disabled={t.body === DEFAULT_SMS_TEMPLATE} onClick={() => resetDefaultTemplate()}>Varsayılana dön</Button>}
              {!t.isDefault && (t.archived
                ? <Button variant="outline" onClick={() => repo.smsTemplates.restore(t.id)}>Geri al</Button>
                : <Button variant="outline" onClick={() => archiveTemplate(t.id)}>Arşivle</Button>)}
            </div>
            <p className="whitespace-pre-wrap text-muted-foreground">{t.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateEditor({ value, onDone }: { value: { id?: string; name: string; body: string }; onDone: () => void }) {
  const [name, setName] = useState(value.name), [body, setBody] = useState(value.body);
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (v: string) => {
    const el = ref.current; const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + v + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length, s + v.length); });
  };
  const save = () => {
    if (!name.trim() || !body.trim()) { toast.error("Ad ve mesaj zorunlu."); return; }
    if (value.id) repo.smsTemplates.update(value.id, { name: name.trim(), body });
    else repo.smsTemplates.create({ name: name.trim(), body, isDefault: false });
    onDone();
  };
  const preview = fillTemplate(body, SAMPLE_VARS);
  return (
    <div className="grid gap-3 rounded-md border-2 border-primary p-4">
      <Input aria-label="Şablon adı" placeholder="Şablon adı" className={`${inputCls} max-w-md`} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {SMS_VARIABLES.map((v) => <Button key={v} type="button" variant="secondary" onClick={() => insert(v)}>{v}</Button>)}
      </div>
      <Textarea ref={ref} aria-label="Mesaj" rows={4} className="text-base" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="rounded-md bg-muted p-3">
        <div className="text-sm font-semibold">Önizleme (örnek verilerle)</div>
        <p className="whitespace-pre-wrap">{preview || "—"}</p>
        <SmsCounter text={preview} />
      </div>
      <div className="flex gap-2">
        <Button size="lg" onClick={save}>Kaydet</Button>
        <Button size="lg" variant="outline" onClick={onDone}>Vazgeç</Button>
      </div>
    </div>
  );
}

const STATUS: Record<SmsLog["status"], string> = { queued: "Kuyrukta", sent: "Gönderildi", failed: "Başarısız" };
function History() {
  const { data } = useRepo(() => repo.smsLogs.list({ includeArchived: true }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [] as SmsLog[]);
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-bold">Gönderim geçmişi</h2>
      {data.length === 0 ? <p className="text-muted-foreground">Henüz kayıt yok.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead><tr className="border-b-2 text-left"><th className="py-2">Tarih</th><th>Müşteri</th><th>Telefon</th><th>Plaka</th><th>Mesaj</th><th>Durum</th><th>Hata</th><th /></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id} className="border-b align-top">
                  <td className="py-3 pr-2 whitespace-nowrap">{formatDate(l.sentAt ?? l.createdAt)}</td>
                  <td className="pr-2">{l.customerName || "—"}</td>
                  <td className="pr-2 whitespace-nowrap">{l.phone || "—"}</td>
                  <td className="pr-2 font-bold whitespace-nowrap">{l.plate ? displayPlate(l.plate) : "—"}</td>
                  <td className="max-w-md pr-2">{l.message}</td>
                  <td className={`pr-2 font-semibold ${l.status === "failed" ? "text-destructive" : ""}`}>{STATUS[l.status]}{(l.attempts ?? 0) > 1 && ` (${l.attempts}. deneme)`}</td>
                  <td className="pr-2 text-destructive">{l.status === "failed" ? l.error : ""}</td>
                  <td>{l.status === "failed" && <Button variant="outline" onClick={async (e) => { const b = e.currentTarget; b.disabled = true; try { const r = await retryOrderSms(l.id); if (r.status === "sent") toast.success("Gönderildi."); else toast.error(r.error ?? "Başarısız"); } catch (err) { toast.error(err instanceof Error ? err.message : "Başarısız"); } finally { b.disabled = false; } }}>Yeniden gönder</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
