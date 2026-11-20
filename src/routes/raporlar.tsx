import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { selectCls } from "@/components/Field";
import { FINANCE_DEFINITIONS } from "@/components/FinanceSummary";
import { PeriodFilter, usePeriod } from "@/components/PeriodFilter";
import { useRepo } from "@/hooks/use-repo";
import {
  financeReport, hasOrderFilter, listStatuses, PAYMENT_STATE_LABEL, serviceReport, vehicleCustomerReport,
  type FinanceReportRow, type PaymentState, type ReportFilter, type SeriesPoint, type ServiceReport, type VehicleReportRow, type CustomerReportRow,
} from "@/lib/repository";
import { BUCKET_LABEL, type BucketUnit } from "@/lib/periods";
import { displayPlate } from "@/lib/format";
import { CURRENCIES, formatMoney } from "@/lib/money";
import type { Currency, ServiceStatus } from "@/lib/types";

export const Route = createFileRoute("/raporlar")({
  head: () => ({
    meta: [
      { title: "Raporlar — Anatek" },
      { name: "description", content: "Servis, finans ve araç/müşteri raporları; para birimine göre ayrı." },
      { property: "og:title", content: "Raporlar — Anatek" },
      { property: "og:description", content: "Servis, finans ve araç/müşteri raporları; para birimine göre ayrı." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Data = { statuses: ServiceStatus[]; service: ServiceReport; finance: FinanceReportRow[]; vc: { vehicles: VehicleReportRow[]; customers: CustomerReportRow[] } };
const EMPTY: Data = { statuses: [], service: { opened: 0, active: 0, completed: 0, delivered: 0, cancelled: 0, series: [] }, finance: [], vc: { vehicles: [], customers: [] } };

function Page() {
  const period = usePeriod("thisMonth");
  const [currency, setCurrency] = useState<"" | Currency>("");
  const [statusId, setStatusId] = useState("");
  const [paymentState, setPaymentState] = useState<"" | PaymentState>("");
  const [customer, setCustomer] = useState("");
  const [plate, setPlate] = useState("");
  const [svcUnit, setSvcUnit] = useState<BucketUnit>("day");
  const [finUnit, setFinUnit] = useState<BucketUnit>("day");
  const r = period.range;
  const filter: ReportFilter = { range: r, currency: currency || undefined, statusId: statusId || undefined, paymentState: paymentState || undefined, customer, plate };
  const { data } = useRepo<Data>(() => ({
    statuses: listStatuses(),
    service: serviceReport(filter, svcUnit),
    finance: financeReport(filter, finUnit),
    vc: vehicleCustomerReport(filter),
  }), EMPTY, [r.from.getTime(), r.to.getTime(), currency, statusId, paymentState, customer, plate, svcUnit, finUnit]);
  const filtered = !!(currency || statusId || paymentState || customer.trim() || plate.trim());
  const clear = () => { setCurrency(""); setStatusId(""); setPaymentState(""); setCustomer(""); setPlate(""); };

  return (
    <section className="grid gap-6">
      <h1 className="text-3xl font-bold">Raporlar</h1>

      <div className="grid gap-4 rounded-md border-2 bg-card p-4">
        <PeriodFilter state={period} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <select aria-label="Para birimi" className={selectCls} value={currency} onChange={(e) => setCurrency(e.target.value as "" | Currency)}>
            <option value="">Tüm para birimleri</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="İşlem durumu" className={selectCls} value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="">Tüm işlem durumları</option>
            {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select aria-label="Ödeme durumu" className={selectCls} value={paymentState} onChange={(e) => setPaymentState(e.target.value as "" | PaymentState)}>
            <option value="">Tüm ödeme durumları</option>
            {(Object.keys(PAYMENT_STATE_LABEL) as PaymentState[]).map((k) => <option key={k} value={k}>{PAYMENT_STATE_LABEL[k]}</option>)}
          </select>
          <Input className="h-11 text-base md:text-base" aria-label="Müşteri filtresi" placeholder="Müşteri adı veya telefon" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <Input className="h-11 text-base md:text-base" aria-label="Plaka filtresi" placeholder="Plaka" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </div>
        {filtered && <div><Button variant="outline" onClick={clear}>Filtreleri temizle</Button></div>}
      </div>

      <Tabs defaultValue="servis" className="grid gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
          <TabsTrigger value="servis" className="h-11 px-5 text-base">Servis</TabsTrigger>
          <TabsTrigger value="finans" className="h-11 px-5 text-base">Finans</TabsTrigger>
          <TabsTrigger value="arac-musteri" className="h-11 px-5 text-base">Araç / Müşteri</TabsTrigger>
        </TabsList>

        <TabsContent value="servis" className="mt-0 grid gap-6">
          <ServiceTab data={data.service} unit={svcUnit} setUnit={setSvcUnit} />
        </TabsContent>
        <TabsContent value="finans" className="mt-0 grid gap-6">
          <FinanceTab rows={data.finance} unit={finUnit} setUnit={setFinUnit} expenseUnfiltered={hasOrderFilter(filter)} />
        </TabsContent>
        <TabsContent value="arac-musteri" className="mt-0 grid gap-6">
          <VehicleCustomerTab data={data.vc} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

// ---- Ortak parçalar ----
function Method({ items }: { items: ReactNode[] }) {
  return (
    <div className="rounded-md border-2 border-dashed p-4">
      <h3 className="text-base font-bold">Hesaplama yöntemi</h3>
      <ul className="mt-1 grid list-disc gap-1 pl-5 text-base text-muted-foreground">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

function UnitPicker({ unit, setUnit, units }: { unit: BucketUnit; setUnit: (u: BucketUnit) => void; units: BucketUnit[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Kırılım">
      {units.map((u) => (
        <Button key={u} type="button" variant={unit === u ? "default" : "outline"} aria-pressed={unit === u} onClick={() => setUnit(u)}>{BUCKET_LABEL[u]}</Button>
      ))}
    </div>
  );
}

/** Sade yatay çubuk grafik. Çubuklar yalnızca aynı listedeki (aynı para birimi) değerlere göre ölçeklenir. */
function Bars({ rows, format, empty = "Bu dönemde kayıt yok." }: { rows: (SeriesPoint & { note?: string })[]; format: (n: number) => string; empty?: string }) {
  const many = rows.length > 12;
  const shown = many ? rows.filter((r) => r.value !== 0) : rows;
  const max = Math.max(1, ...shown.map((r) => Math.abs(r.value)));
  if (shown.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-1">
      <ul className="grid grid-cols-[minmax(6rem,max-content)_1fr_max-content] items-center gap-x-3 gap-y-1.5 text-base">
        {shown.map((r) => (
          <li key={r.label} className="contents">
            <span>{r.label}</span>
            <span className="h-6 rounded-sm bg-muted" aria-hidden><span className="block h-full rounded-sm bg-primary" style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></span>
            <span className="text-right font-semibold tabular-nums">{format(r.value)}{r.note ? <span className="ml-2 font-normal text-muted-foreground">{r.note}</span> : null}</span>
          </li>
        ))}
      </ul>
      {many && <p className="text-sm text-muted-foreground">Kaydı olmayan dilimler gösterilmiyor.</p>}
    </div>
  );
}

function Tile({ label, value, tone = "", sub }: { label: string; value: ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-md border-2 bg-card p-4 text-card-foreground">
      <div className="text-base font-semibold">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-base text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ---- Servis ----
function ServiceTab({ data, unit, setUnit }: { data: ServiceReport; unit: BucketUnit; setUnit: (u: BucketUnit) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Açılan" value={data.opened} />
        <Tile label="Devam eden" value={data.active} />
        <Tile label="Tamamlanan" value={data.completed} />
        <Tile label="Teslim edilen" value={data.delivered} />
        <Tile label="İptal" value={data.cancelled} />
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-xl font-bold">Açılan servis sayısı</h2>
          <UnitPicker unit={unit} setUnit={setUnit} units={["day", "week", "month"]} />
        </div>
        <Bars rows={data.series} format={(n) => `${n} servis`} />
      </div>
      <Method items={[
        "Açılan: giriş tarihi seçilen dönemde olan servisler. Diğer tüm sayılar bu servisler içinden hesaplanır.",
        "Devam eden, Tamamlanan, Teslim edilen ve İptal: bu servislerin şu anki işlem durumuna göre ayrılır; her servis yalnızca bir gruba girer.",
        "Tamamlanan: işi bitmiş ama henüz teslim edilmemiş servisler. Teslim edilenler ayrı sayılır.",
        "Gün/hafta/ay kırılımı: açılan servisler giriş tarihine göre dilimlere ayrılır. Hafta pazartesi başlar.",
        "Para birimi, işlem durumu, ödeme durumu, müşteri ve plaka filtreleri servise uygulanır. Arşivlenmiş servisler sayılmaz.",
      ]} />
    </>
  );
}

// ---- Finans ----
function FinanceTab({ rows, unit, setUnit, expenseUnfiltered }: { rows: FinanceReportRow[]; unit: BucketUnit; setUnit: (u: BucketUnit) => void; expenseUnfiltered: boolean }) {
  const D = FINANCE_DEFINITIONS;
  return (
    <>
      {expenseUnfiltered && (
        <p className="rounded-md border-2 border-warning p-3 text-base font-semibold">
          Gider bir servise bağlı değildir: müşteri, plaka, işlem ve ödeme durumu filtreleri gidere ve net sonuca uygulanmaz.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-bold">Finans özeti</h2>
        <UnitPicker unit={unit} setUnit={setUnit} units={["day", "week", "month", "year"]} />
      </div>
      {rows.map((r) => {
        const m = (n: number) => formatMoney({ amount: n, currency: r.currency });
        return (
          <div key={r.currency} className="grid gap-3" aria-label={`${r.currency} finans raporu`}>
            <h3 className="text-lg font-bold">{r.currency}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Tile label={D.collected.label} value={m(r.collected)} />
              <Tile label={D.pending.label} value={m(r.pending)} sub={`${r.pendingCount} servis`} tone={r.pending > 0 ? "text-destructive" : ""} />
              <Tile label={D.partial.label} value={m(r.partial)} sub={`${r.partialCount} servis`} />
              <Tile label={D.expense.label} value={m(r.expense)} />
              <Tile label={D.net.label} value={m(r.net)} tone={r.net > 0 ? "text-success" : r.net < 0 ? "text-destructive" : ""} />
            </div>
            <h4 className="text-base font-bold">Tahsilat — {BUCKET_LABEL[unit].toLocaleLowerCase("tr")} bazında ({r.currency})</h4>
            <Bars rows={r.series} format={m} empty="Bu dönemde tahsilat yok." />
          </div>
        );
      })}
      <Method items={[
        `${D.collected.label}: ${D.collected.def} Ödeme, bağlı olduğu servis filtreye uyuyorsa sayılır.`,
        `${D.pending.label}: ${D.pending.def} (servis toplamı − geçerli ödemeler).`,
        `${D.partial.label}: ${D.partial.def}`,
        `${D.expense.label}: ${D.expense.def} Yalnızca tarih ve para birimi filtresine uyar.`,
        `${D.net.label}: ${D.net.def}`,
        "Gün/hafta/ay/yıl kırılımı: tahsilatlar ödeme tarihine göre dilimlere ayrılır.",
        "Her para birimi ayrı hesaplanır; birimler çevrilmez, toplanmaz, karşılaştırılmaz.",
      ]} />

      <div className="grid gap-4">
        <h2 className="text-xl font-bold">Ödeme yöntemine göre tahsilat</h2>
        {rows.map((r) => (
          <div key={r.currency} className="grid gap-2">
            <h3 className="text-lg font-bold">{r.currency}</h3>
            <Bars rows={r.byMethod.map((x) => ({ label: x.label, value: x.value, note: `${x.count} ödeme` }))} format={(n) => formatMoney({ amount: n, currency: r.currency })} />
          </div>
        ))}
      </div>
      <Method items={[
        "Dönemdeki geçerli tahsilatlar (iptal/iade hariç) kaydedilen ödeme yöntemine göre toplanır.",
        "Çubuklar yalnızca aynı para birimindeki yöntemler arasında karşılaştırma yapar.",
      ]} />
    </>
  );
}

// ---- Araç / Müşteri ----
function VehicleCustomerTab({ data }: { data: { vehicles: VehicleReportRow[]; customers: CustomerReportRow[] } }) {
  const max = Math.max(1, ...data.vehicles.map((v) => v.count));
  const byCurrency = CURRENCIES.map((c) => ({ c, rows: data.customers.filter((r) => r.currency === c) })).filter((g) => g.rows.length);
  return (
    <>
      <div className="grid gap-2">
        <h2 className="text-xl font-bold">En çok işlem gören araçlar</h2>
        {data.vehicles.length === 0 ? <p className="text-muted-foreground">Bu dönemde servis yok.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-base [&_td]:px-2 [&_th]:px-2">
              <thead><tr className="border-b-2 text-left"><th className="py-2">#</th><th>Plaka</th><th>Araç</th><th>Müşteri</th><th>İşlem sayısı</th><th className="amount">Servis tutarı</th></tr></thead>
              <tbody>{data.vehicles.map((v, i) => (
                <tr key={v.vehicleId} className="border-b">
                  <td className="py-2">{i + 1}</td>
                  <td className="whitespace-nowrap font-semibold"><Link to="/araclar/$id" params={{ id: v.vehicleId }} className="underline underline-offset-4">{displayPlate(v.plate)}</Link></td>
                  <td>{v.vehicle}</td>
                  <td>{v.customer}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-right font-semibold tabular-nums">{v.count}</span>
                      <span className="h-4 w-32 rounded-sm bg-muted" aria-hidden><span className="block h-full rounded-sm bg-primary" style={{ width: `${(v.count / max) * 100}%` }} /></span>
                    </div>
                  </td>
                  <td className="amount whitespace-nowrap">{v.totals.map((t) => <div key={t.currency}>{formatMoney(t)}</div>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <Method items={[
        "Dönemde açılan (giriş tarihi) ve filtreye uyan servisler araca göre sayılır; en çok servisi olan ilk 10 araç listelenir.",
        "Servis tutarı: bu servislerin kalem toplamı. Farklı para birimleri ayrı satırda gösterilir, toplanmaz.",
      ]} />

      <div className="grid gap-4">
        <h2 className="text-xl font-bold">Müşteri bazında tahsilat ve bekleyen borç</h2>
        {byCurrency.length === 0 ? <p className="text-muted-foreground">Bu dönemde kayıt yok.</p> : byCurrency.map((g) => (
          <div key={g.c} className="grid gap-2">
            <h3 className="text-lg font-bold">{g.c}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-base [&_td]:px-2 [&_th]:px-2">
                <thead><tr className="border-b-2 text-left"><th className="py-2">Müşteri</th><th>Telefon</th><th>Servis sayısı</th><th className="amount">Tahsilat</th><th className="amount">Bekleyen borç</th></tr></thead>
                <tbody>{g.rows.map((r) => (
                  <tr key={r.customerId} className="border-b">
                    <td className="py-2 font-semibold">{r.customerId ? <Link to="/musteriler/$id" params={{ id: r.customerId }} className="underline underline-offset-4">{r.customer}</Link> : r.customer}</td>
                    <td className="whitespace-nowrap">{r.phone || "—"}</td>
                    <td>{r.orders}</td>
                    <td className="amount whitespace-nowrap">{formatMoney({ amount: r.collected, currency: r.currency })}</td>
                    <td className={`amount whitespace-nowrap font-semibold ${r.pending > 0 ? "text-destructive" : ""}`}>{formatMoney({ amount: r.pending, currency: r.currency })}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <Method items={[
        "Her müşteri her para birimi için ayrı satırda gösterilir; para birimleri birleştirilmez.",
        "Servis sayısı ve bekleyen borç: dönemde açılan, filtreye uyan servisler (servis toplamı − geçerli ödemeler).",
        "Tahsilat: ödeme tarihi dönemde olan geçerli ödemeler (iptal/iade hariç), servisi filtreye uyuyorsa.",
        "Sıralama: önce en yüksek bekleyen borç, sonra en yüksek tahsilat.",
      ]} />
    </>
  );
}
