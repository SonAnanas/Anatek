import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, getLastHealth, runHealthCheck, type HealthCategory, type HealthReport } from "@/lib/integrity";
import { TABLE_LABELS } from "@/lib/backup";

const SHOWN = ["customers", "vehicles", "workOrders", "workOrderItems", "payments", "expenses", "maintenanceReminders"] as const;

/** Ayarlar > Veri Sağlığı. Salt okunur: hiçbir kaydı değiştirmez, silmez, birleştirmez. */
export function DataHealth() {
  const [rep, setRep] = useState<HealthReport | null>(null);
  const [last, setLast] = useState<{ at: string; errors: number; warnings: number } | null>(null);
  useEffect(() => setLast(getLastHealth()), []);
  const run = () => { setRep(runHealthCheck()); setLast(getLastHealth()); };

  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-bold">Veri Sağlığı</h2>
      <p className="text-sm text-muted-foreground">Kayıtlar arasındaki bağları, yinelenen kayıtları, ödeme tutarlarını ve eksik alanları kontrol eder. Hiçbir kaydı değiştirmez, silmez veya birleştirmez; düzeltmeyi siz yaparsınız.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={run}>Şimdi kontrol et</Button>
        <span className="text-sm">{last ? <>Son kontrol: <b>{new Date(last.at).toLocaleString("tr-TR")}</b> — {last.errors} hata, {last.warnings} uyarı</> : "Henüz kontrol edilmedi."}</span>
      </div>
      {rep && (
        <div className="grid gap-4">
          <p className="text-sm">{SHOWN.map((t) => `${TABLE_LABELS[t]}: ${rep.counts[t]}`).join(" · ")}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(Object.keys(CATEGORY_LABEL) as HealthCategory[]).map((c) => (
              <div key={c} className="rounded-md border p-3">
                <div className={`text-2xl font-bold ${rep.byCategory[c] ? "text-destructive" : ""}`}>{rep.byCategory[c]}</div>
                <div className="text-sm">{CATEGORY_LABEL[c]}</div>
              </div>
            ))}
          </div>
          {rep.issues.length === 0 ? <p role="status" className="font-semibold text-success">Sorun bulunmadı. Kayıtlar tutarlı görünüyor.</p> : (
            (Object.keys(CATEGORY_LABEL) as HealthCategory[]).filter((c) => rep.byCategory[c] > 0).map((c) => (
              <div key={c} className="grid gap-2">
                <h3 className="font-bold">{CATEGORY_LABEL[c]}</h3>
                <ul className="grid gap-2">
                  {rep.issues.filter((i) => i.category === c).map((i, k) => (
                    <li key={k} className="flex flex-wrap items-center gap-2">
                      <Badge variant={i.severity === "error" ? "unpaid" : "partial"} className="text-xs">{i.severity === "error" ? "Hata" : "Uyarı"}</Badge>
                      <span>{i.message}</span>
                      {i.links.map((l) => <Link key={l.id} to={l.to as "/araclar/$id"} params={{ id: l.id }} className="text-primary underline">Git: {l.label}</Link>)}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="text-sm text-muted-foreground">Bir kaydı düzeltmeden veya silmeden önce Veri yedekleme sayfasından yedek almanız önerilir.</p>
        </div>
      )}
    </div>
  );
}
