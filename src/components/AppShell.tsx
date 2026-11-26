import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Car, Database, Keyboard, LayoutDashboard, Menu as MenuIcon, MessageSquare, Moon, Power, Settings, Sun, Users, Wallet, Wrench, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReleaseNotesDialog } from "@/components/ReleaseNotes";
import { PlateSearch } from "./PlateSearch";
import { WorkOrderForm } from "./WorkOrderForm";
import { SmsCompletionDialog } from "@/components/SmsCompletionDialog";
import { onFocusPlateSearch, onOpenServiceForm } from "@/lib/service-events";
import { getSmsSettings, preferences, type Theme } from "@/lib/repository";
import { useRepo } from "@/hooks/use-repo";
import { canExit, exitApp } from "@/lib/app-exit";
import { BUILD_INFO } from "@/lib/build-info";
import { maybeCheckUpdate } from "@/lib/update-check";

const nav = [
  { to: "/", label: "Genel bakış", icon: LayoutDashboard },
  { to: "/servis", label: "Servis işlemleri", icon: Wrench },
  { to: "/musteriler", label: "Müşteriler", icon: Users },
  { to: "/araclar", label: "Araçlar", icon: Car },
  { to: "/odemeler", label: "Ödemeler ve borçlar", icon: Wallet },
  { to: "/gelir-gider", label: "Gelir ve giderler", icon: Receipt },
  { to: "/raporlar", label: "Raporlar", icon: BarChart3 },
  { to: "/sms", label: "SMS geçmişi", icon: MessageSquare },
  { to: "/ayarlar", label: "Ayarlar", icon: Settings },
  { to: "/yedekleme", label: "Veri yedekleme", icon: Database },
] as const;

/** Telefondaki alt menü: en sık kullanılan 4 sayfa (kalanlar "Daha fazla" penceresinde). */
const tabs = [
  { to: "/", label: "Genel", icon: LayoutDashboard },
  { to: "/servis", label: "Servis", icon: Wrench },
  { to: "/musteriler", label: "Müşteri", icon: Users },
  { to: "/araclar", label: "Araç", icon: Car },
] as const;
const SHORTCUTS = [["Ctrl + F", "Plaka ara"], ["Ctrl + N", "Yeni servis kaydı"], ["Ctrl + S", "Açık formu kaydet (servis ve ödeme formları)"], ["Esc", "Pencereyi kapat / vazgeç"]] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [svc, setSvc] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  useEffect(() => onOpenServiceForm((id) => setSvc({ open: true, id })), []);
  useEffect(() => onFocusPlateSearch(() => { searchRef.current?.focus(); searchRef.current?.select(); }), []);

  useEffect(() => { setTheme(preferences.getTheme()); }, []);
  const { data: firm } = useRepo(() => getSmsSettings().businessName.trim(), "");
  const brand = firm ? `Anatek - ${firm}` : "Anatek";
  // Pencere/sekme başlığı: "Genel bakış — Anatek - Firma adı". Yönlendirici başlığı her sayfada yenilediği için başlık değişimi izlenir.
  useEffect(() => {
    const apply = () => { const next = document.title.replace(/Anatek( - .*)?$/, brand); if (next !== document.title) document.title = next; };
    apply();
    // <title> elemanı bu anda henüz olmayabilir; bu yüzden tüm <head> izlenir.
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [brand]);
  const [exitable, setExitable] = useState(false);
  useEffect(() => { void maybeCheckUpdate(); }, []); // yeni sürüm var mı (arka planda, günde en fazla iki kez)
  const [more, setMore] = useState(false), [keys, setKeys] = useState(false), [notes, setNotes] = useState(false), [typing, setTyping] = useState(false);
  // Yazı alanı odaktayken (telefonda klavye açık) alt menü gizlenir; alanlar görünür kalır.
  useEffect(() => {
    const on = (e: FocusEvent) => setTyping(/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? ""));
    const off = () => setTyping(false);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);
  useEffect(() => setExitable(canExit()), []);
  // Dosya pencerenin herhangi bir yerine bırakılınca tarayıcı/Windows o dosyaya gitmesin.
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", stop); window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); setSvc({ open: true, id: null }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next); preferences.setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <aside className="hidden flex-col bg-sidebar text-sidebar-foreground md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:overflow-y-auto md:border-r-2">
        <div className="flex items-center gap-3 px-4 py-3 md:flex-col md:gap-1 md:py-5 md:text-center" title={brand}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-1.5"><img src="/anatek-icon.png" alt="" className="h-full w-full object-contain" /></span>
          <span className="flex min-w-0 flex-col md:items-center">
            <span className="text-xl font-bold leading-tight tracking-wide">Anatek</span>
            {firm && <span className="line-clamp-2 break-words text-sm leading-snug opacity-80">{firm}</span>}
          </span>
        </div>
        <nav className="flex flex-wrap gap-1 px-2 md:flex-1 md:flex-col md:flex-nowrap">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: true }} className="nav-link">
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <button onClick={toggleTheme} className="nav-link m-2" aria-label="Temayı değiştir">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          <span>{theme === "dark" ? "Açık tema" : "Koyu tema"}</span>
        </button>
        {exitable && (
          <button onClick={() => { if (window.confirm("Uygulamadan çıkılsın mı?")) void exitApp(); }} className="nav-link mx-2 mb-2" aria-label="Uygulamadan çık">
            <Power className="h-5 w-5" aria-hidden /><span>Çıkış</span>
          </button>
        )}
        <button onClick={() => setKeys(true)} className="nav-link mx-2" aria-label="Klavye kısayolları"><Keyboard className="h-5 w-5" aria-hidden /><span>Kısayollar</span></button>
        <button onClick={() => setNotes(true)} className="px-4 pb-3 pt-1 text-left text-xs underline opacity-70 hover:opacity-100" title="Sürüm notlarını aç">Sürüm {BUILD_INFO.version} · derleme #{BUILD_INFO.build}</button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col md:ml-56">
        <div className="flex items-center gap-3 border-b-2 bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden" title={brand}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1"><img src="/anatek-icon.png" alt="" className="h-full w-full object-contain" /></span>
          <span className="min-w-0 truncate text-base font-bold">{brand}</span>
        </div>
        <header className="sticky top-0 z-10 border-b-2 bg-background px-4 py-4 md:px-6">
          <PlateSearch ref={searchRef} />
        </header>
        <main className="min-w-0 flex-1 p-4 pb-24 md:p-6">{children}</main>
        <SmsCompletionDialog />
        <WorkOrderForm open={svc.open} orderId={svc.id} onOpenChange={(o) => setSvc((p) => ({ ...p, open: o }))} />
      </div>
      {!typing && (
        <nav aria-label="Ana gezinme" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t-2 bg-sidebar text-sidebar-foreground md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center" activeProps={{ className: "flex min-h-14 flex-col items-center justify-center gap-0.5 bg-primary px-1 py-1.5 text-center text-primary-foreground" }}>
              <Icon className="h-6 w-6" aria-hidden /><span className="text-[11px] leading-tight">{label}</span>
            </Link>
          ))}
          <button onClick={() => setMore(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center" aria-label="Diğer sayfalar ve ayarlar">
            <MenuIcon className="h-6 w-6" aria-hidden /><span className="text-[11px] leading-tight">Daha fazla</span>
          </button>
        </nav>
      )}
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-2xl">Menü</DialogTitle></DialogHeader>
          <div className="grid gap-1">
            {nav.slice(4).map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} onClick={() => setMore(false)} className="nav-link"><Icon className="h-5 w-5 shrink-0" aria-hidden /><span>{label}</span></Link>
            ))}
            <button onClick={toggleTheme} className="nav-link" aria-label="Temayı değiştir">{theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}<span>{theme === "dark" ? "Açık tema" : "Koyu tema"}</span></button>
            {exitable && <button onClick={() => { if (window.confirm("Uygulamadan çıkılsın mı?")) void exitApp(); }} className="nav-link" aria-label="Uygulamadan çık"><Power className="h-5 w-5" aria-hidden /><span>Çıkış</span></button>}
            <button onClick={() => { setMore(false); setNotes(true); }} className="px-4 pt-2 text-left text-sm underline opacity-80">Sürüm {BUILD_INFO.version} · derleme #{BUILD_INFO.build} — sürüm notları</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={keys} onOpenChange={setKeys}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-2xl">Klavye kısayolları</DialogTitle></DialogHeader>
          <ul className="grid gap-2">{SHORTCUTS.map(([k, d]) => <li key={k} className="flex items-center gap-3"><kbd className="min-w-24 rounded border-2 px-2 py-1 text-center text-sm font-bold">{k}</kbd><span>{d}</span></li>)}</ul>
        </DialogContent>
      </Dialog>
      <ReleaseNotesDialog open={notes} onOpenChange={setNotes} />
    </div>
  );
}

export function EmptyPage({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{description}</p>
      <div className="mt-8 rounded-lg border-2 border-dashed p-12 text-center text-muted-foreground">Bu bölüm henüz hazır değil.</div>
    </section>
  );
}
