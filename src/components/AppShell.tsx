import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Car, Database, LayoutDashboard, MessageSquare, Moon, Settings, Sun, Users, Wallet, Wrench, Receipt } from "lucide-react";
import { PlateSearch } from "./PlateSearch";
import { WorkOrderForm } from "./WorkOrderForm";
import { SmsCompletionDialog } from "@/components/SmsCompletionDialog";
import { onFocusPlateSearch, onOpenServiceForm } from "@/lib/service-events";
import { preferences, type Theme } from "@/lib/repository";

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

export function AppShell({ children }: { children: ReactNode }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [svc, setSvc] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  useEffect(() => onOpenServiceForm((id) => setSvc({ open: true, id })), []);
  useEffect(() => onFocusPlateSearch(() => { searchRef.current?.focus(); searchRef.current?.select(); }), []);

  useEffect(() => { setTheme(preferences.getTheme()); }, []);
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
      <aside className="flex flex-col border-b-2 bg-sidebar text-sidebar-foreground md:fixed md:inset-y-0 md:left-0 md:w-56 md:border-b-0 md:border-r-2">
        <div className="px-4 py-3 text-lg font-bold md:py-5">Anatek</div>
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col md:ml-56">
        <header className="sticky top-0 z-10 border-b-2 bg-background px-4 py-4 md:px-6">
          <PlateSearch ref={searchRef} />
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        <SmsCompletionDialog />
        <WorkOrderForm open={svc.open} orderId={svc.id} onOpenChange={(o) => setSvc((p) => ({ ...p, open: o }))} />
      </div>
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
