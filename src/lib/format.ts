/** "34ABC123" -> "34 ABC 123" (yalnızca gösterim) */
export function displayPlate(p: string): string {
  const m = p.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("tr-TR");
