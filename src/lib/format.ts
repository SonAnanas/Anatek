/** "34ABC123" -> "34 ABC 123" (yalnızca gösterim) */
export function displayPlate(p: string): string {
  const m = p.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("tr-TR");

/** Telefonu yazarken biçimler: "5321112233", "+90 532 111 22 33", "905321112233" → "0532 111 22 33". Yabancı (+90 dışı) numaraya dokunmaz. */
export function formatPhoneInput(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("+") && !t.startsWith("+90")) return raw;
  let d = raw.replace(/\D/g, "");
  if (d.length === 0) return "";
  if ((t.startsWith("+90") || d.length >= 12) && d.startsWith("90")) d = "0" + d.slice(2);
  else if (!d.startsWith("0")) d = "0" + d;
  d = d.slice(0, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean).join(" ");
}
