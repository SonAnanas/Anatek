// "Güncelleme var mı?": GitHub'daki son sürümün başlığındaki "derleme N" numarasını bu uygulamanın numarasıyla karşılaştırır.
import { BUILD_INFO } from "./build-info";

export type UpdateState = { state: "current" | "newer" | "unknown"; latest?: number | undefined; message: string; publishedAt?: string | undefined; notes?: string | undefined };

export function parseBuildNumber(title: string): number | null {
  const m = /derleme\s+(\d+)/i.exec(title);
  return m ? Number(m[1]) : null;
}
export function compareBuild(current: string, latestTitle: string): UpdateState {
  const latest = parseBuildNumber(latestTitle);
  const cur = /^\d+$/.test(current) ? Number(current) : null;
  if (latest === null) return { state: "unknown", message: "Son sürümün numarası okunamadı." };
  if (cur === null) return { state: "unknown", latest, message: `Bu uygulama yerelde derlenmiş (numarasız). Yayındaki son sürüm: derleme ${latest}.` };
  if (latest > cur) return { state: "newer", latest, message: `Yeni sürüm var: derleme ${latest} (sizde ${cur}). İndirme sayfasından yeni dosyayı indirip kurun; verileriniz korunur.` };
  return { state: "current", latest, message: `Güncelsiniz (derleme ${cur}).` };
}
export async function checkForUpdate(fetchFn: typeof fetch = fetch, repo: string = BUILD_INFO.repo, build: string = BUILD_INFO.build): Promise<UpdateState> {
  if (!repo) return { state: "unknown", message: "Bu sürümde depo bilgisi yok; güncelleme kontrol edilemiyor." };
  try {
    const r = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return { state: "unknown", message: `Son sürüm bilgisi alınamadı (hata ${r.status}).` };
    const j = (await r.json()) as { name?: string; published_at?: string; body?: string };
    return { ...compareBuild(build, j.name ?? ""), publishedAt: j.published_at, notes: j.body?.trim() || undefined };
  } catch { return { state: "unknown", message: "Güncelleme kontrol edilemedi (internet var mı?)." }; }
}

// ---- Arka planda kontrol (günde en fazla iki kez) ve Genel bakış uyarısı için saklanan sonuç ----
const UPDATE_KEY = "otoservis:update-info";
const EVERY = 12 * 3600_000;
export type StoredUpdate = { at: number; state: "current" | "newer"; latest?: number | undefined; publishedAt?: string | undefined };
export function getStoredUpdate(): StoredUpdate | null {
  try { const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(UPDATE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function maybeCheckUpdate(fetchFn: typeof fetch = fetch, now = Date.now(), repo: string = BUILD_INFO.repo, build: string = BUILD_INFO.build): Promise<StoredUpdate | null> {
  if (!repo || typeof localStorage === "undefined") return null;
  const old = getStoredUpdate();
  if (old && now - old.at < EVERY) return old;
  const r = await checkForUpdate(fetchFn, repo, build);
  if (r.state === "unknown") return old; // ulaşılamadıysa kaydetme: bir sonraki açılışta yeniden denenir
  const s: StoredUpdate = { at: now, state: r.state, latest: r.latest, publishedAt: r.publishedAt };
  try { localStorage.setItem(UPDATE_KEY, JSON.stringify(s)); window.dispatchEvent(new Event("anatek-update")); } catch { /* saklanamazsa uyarı çıkmaz */ }
  return s;
}
