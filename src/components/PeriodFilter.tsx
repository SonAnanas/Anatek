import { useMemo, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERIODS, periodRange, rangeLabel, toDateInput, type PeriodKey, type Range } from "@/lib/periods";

export type PeriodState = { key: PeriodKey; setKey: (k: PeriodKey) => void; custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void; range: Range };

export function usePeriod(initial: PeriodKey): PeriodState {
  const [key, setKey] = useState<PeriodKey>(initial);
  const [custom, setCustom] = useState(() => { const t = toDateInput(new Date()); return { from: t, to: t }; });
  const range = useMemo(() => periodRange(key, new Date(), custom), [key, custom]);
  return { key, setKey, custom, setCustom, range };
}

/** Tarih filtresi: Bugün … Bu yıl, Özel aralık. */
export function PeriodFilter({ state }: { state: PeriodState }) {
  const hydrated = useHydrated();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tarih aralığı">
        {PERIODS.map((p) => (
          <Button key={p.key} type="button" variant={state.key === p.key ? "default" : "outline"} aria-pressed={state.key === p.key} onClick={() => state.setKey(p.key)}>
            {p.label}
          </Button>
        ))}
      </div>
      {state.key === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">Başlangıç
            <Input type="date" className="h-11 w-auto text-base" value={state.custom.from} onChange={(e) => state.setCustom({ ...state.custom, from: e.target.value })} />
          </label>
          <label className="flex items-center gap-2">Bitiş
            <Input type="date" className="h-11 w-auto text-base" value={state.custom.to} onChange={(e) => state.setCustom({ ...state.custom, to: e.target.value })} />
          </label>
        </div>
      )}
      <p className="text-base text-muted-foreground">Dönem: <b className="text-foreground">{hydrated ? rangeLabel(state.range) : "…"}</b></p>
    </div>
  );
}
