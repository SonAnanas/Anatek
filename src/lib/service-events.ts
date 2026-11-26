/** Servis formunu her sayfadan açmak için küçük olay kanalı (Ctrl+N, butonlar). */
const EVT = "open-service-form";
export function openServiceForm(orderId?: string) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: orderId ?? null }));
}
export function onOpenServiceForm(fn: (orderId: string | null) => void) {
  const h = (e: Event) => fn((e as CustomEvent<string | null>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

/** Üstteki plaka arama kutusuna odaklan (Ctrl+F ile aynı). */
const FOCUS = "focus-plate-search";
export function focusPlateSearch() { window.dispatchEvent(new Event(FOCUS)); }
export function onFocusPlateSearch(fn: () => void) {
  window.addEventListener(FOCUS, fn);
  return () => window.removeEventListener(FOCUS, fn);
}
