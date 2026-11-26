// Çift tıklama koruması: ilk gönderimden sonra kısa süre (varsayılan 1,2 sn) ikinci gönderim yok sayılır.
import { useRef } from "react";

export function createSubmitGuard(ms = 1200, now: () => number = Date.now) {
  let until = 0;
  return (fn: () => void): boolean => {
    if (now() < until) return false;
    until = now() + ms;
    fn();
    return true;
  };
}
export function useSubmitGuard(ms = 1200) {
  const ref = useRef<ReturnType<typeof createSubmitGuard> | null>(null);
  if (!ref.current) ref.current = createSubmitGuard(ms);
  return ref.current;
}
