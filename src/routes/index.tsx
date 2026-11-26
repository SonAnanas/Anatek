import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "@/components/CustomerForm";
import { VehicleForm } from "@/components/VehicleForm";
import { FinanceCards } from "@/components/FinanceSummary";
import { PaymentBadge, QuickPaymentDialog } from "@/components/Payments";
import { PeriodFilter, usePeriod } from "@/components/PeriodFilter";
import { useRepo } from "@/hooks/use-repo";
import { customerName, daysSinceBackup, orderBalance, periodSummary, repo, serviceIndicators, storageUsage, upcomingReminders, type OrderBalance, type PeriodSummary, type UpcomingReminder } from "@/lib/repository";
import { UpcomingList } from "@/components/ReminderForm";
import { checkIntegrity } from "@/lib/integrity";
import { UpdateBanner } from "@/components/UpdatePanel";
import type { WorkOrder } from "@/lib/types";
import { displayPlate, formatDate } from "@/lib/format";
import { focusPlateSearch, openServiceForm } from "@/lib/service-events";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Genel bakış — Anatek" },
      { name: "description", content: "Ciro, tahsilat, bekleyen borç, gider ve net sonuç; servis göstergeleri ve hızlı erişim." },
      { property: "og:title", content: "Genel bakış — Anatek" },
      { property: "og:description", content: "Ciro, tahsilat, bekleyen borç, gider ve net sonuç; servis göstergeleri ve hızlı erişim." },
    ],
  }),
  component: Page,
});

type DashData = { summary: PeriodSummary[]; ind: ReturnType<typeof serviceIndicators>; recent: { w: WorkOrder; customer: string; plate: string; b: OrderBalance | undefined }[]; reminders: UpcomingReminder[]; notices: string[]; healthErrors: number };
const EMPTY: DashData = { summary: [], ind: { inProgress: 0, awaitingDelivery: 0, awaitingPayment: 0, openedToday: 0, recentCompleted: [] }, recent: [], reminders: [], notices: [], healthErrors: 0 };

function Page() {
  const period = usePeriod("today");
  const r = period.range;
  const [dlg, setDlg] = useState<"customer" | "vehicle" | "payment" | null>(null);
  const { data, ready } = useRepo(() => {
    const ind = serviceIndicators();
    const notices: string[] = [];
    if (repo.customers.list().length > 0) {
      const days = daysSinceBackup();
      if (days === null) notices.push("Henüz hiç yedek alınmadı. Kayıtlarınızı korumak için yedek alın.");
      else if (days >= 7) notices.push(`Son yedek ${days} gün önce alındı. Yeni yedek alın.`);
      const u = storageUsage();
      if (u.ratio >= 0.7) notices.push(`Kayıt alanı yaklaşık %${Math.round(u.ratio * 100)} dolu. Yedek alın; alan dolarsa yeni kayıt yapılamaz.`);
    }
    return {
      summary: periodSummary(r), ind, reminders: upcomingReminders(), notices, healthErrors: checkIntegrity().errors,
      recent: ind.recentCompleted.map((w) => {
        const c = repo.customers.get(w.customerId), v = repo.vehicles.get(w.vehicleId);
        return { w, customer: c ? customerName(c) : "—", plate: v?.plate ?? "", b: orderBalance(w.id) };
      }),
    };
  }, EMPTY, [r.from.getTime(), r.to.getTime()]);

  const tiles = [
    { label: "Devam eden", value: data.ind.inProgress, to: "/servis" as const },
    { label: "Teslim bekleyen", value: data.ind.awaitingDelivery, to: "/servis" as const },
    { label: "Ödemesi bekleyen", value: data.ind.awaitingPayment, to: "/odemeler" as const },
    { label: "Bugün açılan", value: data.ind.openedToday, to: "/servis" as const },
  ];

  return (
    <section className="grid gap-8">
      <h1 className="text-3xl font-bold">Genel bakış</h1>

      <UpdateBanner />

      {ready && data.healthErrors > 0 && (
        <Link to="/ayarlar" className="rounded-md border-2 border-destructive bg-card p-3 text-base font-semibold hover:border-primary">Veri sağlığı: {data.healthErrors} sorun bulundu. Ayarlar → Veri Sağlığı bölümünden inceleyin.</Link>
      )}

      {ready && data.notices.length > 0 && (
        <div className="grid gap-2">{data.notices.map((n) => <Link key={n} to="/yedekleme" className="rounded-md border-2 border-warning bg-card p-3 text-base font-semibold hover:border-primary">{n}</Link>)}</div>
      )}

      <nav aria-label="Hızlı erişim" className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => openServiceForm()} title="Ctrl+N">Yeni servis</Button>
        <Button size="lg" variant="outline" onClick={() => setDlg("customer")}>Yeni müşteri</Button>
        <Button size="lg" variant="outline" onClick={() => setDlg("vehicle")}>Yeni araç</Button>
        <Button size="lg" variant="outline" onClick={() => focusPlateSearch()} title="Ctrl+F">Plaka ara</Button>
        <Button size="lg" variant="outline" onClick={() => setDlg("payment")}>Ödeme kaydet</Button>
        <Button size="lg" variant="outline" asChild><Link to="/odemeler">Borçlar</Link></Button>
        <Button size="lg" variant="outline" asChild><Link to="/raporlar">Raporlar</Link></Button>
      </nav>

      <div className="grid gap-3">
        <h2 className="text-2xl font-bold">Servis göstergeleri</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} to={t.to} className="grid gap-1 rounded-md border-2 bg-card p-4 text-card-foreground hover:border-primary">
              <span className="text-base font-semibold">{t.label}</span>
              <span className="text-4xl font-bold tabular-nums">{ready ? t.value : "–"}</span>
            </Link>
          ))}
        </div>
        <h3 className="mt-2 text-lg font-bold">Son tamamlananlar</h3>
        {data.recent.length === 0 ? <p className="text-muted-foreground">Henüz tamamlanan servis yok.</p> : (
          <ul className="grid gap-2">{data.recent.map(({ w, customer, plate, b }) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3">
              <button type="button" className="font-semibold text-primary underline" onClick={() => openServiceForm(w.id)}>{w.orderNo}</button>
              <span className="font-bold tracking-wider">{displayPlate(plate)}</span>
              <span>{customer}</span>
              <span className="text-muted-foreground">Tamamlandı: {w.completedAt ? formatDate(w.completedAt) : "—"}</span>
              {b && <PaymentBadge state={b.state} />}
            </li>
          ))}</ul>
        )}
      </div>

      <div className="grid gap-3">
        <h2 className="text-2xl font-bold">Yaklaşan bakımlar</h2>
        <UpcomingList items={data.reminders} />
      </div>

      <div className="grid gap-3">
        <h2 className="text-2xl font-bold">Para özeti</h2>
        <PeriodFilter state={period} />
        <FinanceCards rows={data.summary} />
      </div>

      <CustomerForm open={dlg === "customer"} onOpenChange={(o) => setDlg(o ? "customer" : null)} />
      <VehicleForm open={dlg === "vehicle"} onOpenChange={(o) => setDlg(o ? "vehicle" : null)} />
      <QuickPaymentDialog open={dlg === "payment"} onOpenChange={(o) => setDlg(o ? "payment" : null)} />
    </section>
  );
}
