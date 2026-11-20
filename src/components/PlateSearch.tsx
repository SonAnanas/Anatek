import { useNavigate } from "@tanstack/react-router";
import { forwardRef, useState } from "react";
import { Search } from "lucide-react";
import { useRepo } from "@/hooks/use-repo";
import { customerName, repo, searchVehiclesByPlate } from "@/lib/repository";
import { displayPlate } from "@/lib/format";

export const PlateSearch = forwardRef<HTMLInputElement>(function PlateSearch(_, ref) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { data } = useRepo(() => searchVehiclesByPlate(q), [], [q]);
  const go = (id: string) => { setQ(""); navigate({ to: "/araclar/$id", params: { id } }); };
  return (
    <div className="relative max-w-2xl">
      <label className="relative block">
        <span className="sr-only">Plaka ara</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input ref={ref} type="search" value={q} placeholder="Plaka ara (Ctrl+F) — örn. 34 ABC 123" className="plate-search" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, data.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && data[active]) go(data[active].id);
            if (e.key === "Escape") setQ("");
          }} />
      </label>
      {q.trim() && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border-2 bg-popover text-popover-foreground shadow-lg">
          {data.length === 0 && <li className="px-4 py-3 text-muted-foreground">Bu plakayla araç bulunamadı.</li>}
          {data.map((v, i) => {
            const c = repo.customers.get(v.customerId);
            return (
              <li key={v.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); go(v.id); }}
                  className={`flex w-full justify-between gap-4 px-4 py-3 text-left ${i === active ? "bg-accent text-accent-foreground" : ""}`}>
                  <span className="font-bold">{displayPlate(v.plate)}</span>
                  <span>{v.brand} {v.model}</span>
                  <span className="text-muted-foreground">{c ? customerName(c) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
