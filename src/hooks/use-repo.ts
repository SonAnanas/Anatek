import { useEffect, useState } from "react";
import { ensureSeeded, subscribe } from "@/lib/repository";

/** Repository'den veri okur; veri değişince yeniden okur. SSR'da `fallback` döner. */
export function useRepo<T>(read: () => T, fallback: T, deps: unknown[] = []): { data: T; ready: boolean } {
  const [state, setState] = useState<{ data: T; ready: boolean }>({ data: fallback, ready: false });
  useEffect(() => {
    ensureSeeded();
    const run = () => setState({ data: read(), ready: true });
    run();
    return subscribe(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
