import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUILD_INFO } from "@/lib/build-info";
import { RELEASES } from "@/lib/release-notes";

/** Sürüm notları penceresi. Varsayılan: en yeni üstte; düğmeyle eskiden yeniye çevrilir. */
export function ReleaseNotesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [oldFirst, setOldFirst] = useState(false);
  const list = oldFirst ? [...RELEASES].reverse() : RELEASES;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="text-2xl">Sürüm notları</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setOldFirst((v) => !v)}>{oldFirst ? "Yeniden eskiye göster" : "Eskiden yeniye göster"}</Button>
          <span className="text-sm text-muted-foreground">Kullandığınız sürüm: {BUILD_INFO.version}</span>
        </div>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {list.map((r) => (
            <section key={r.version}>
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {r.version}
                {r.version === BUILD_INFO.version && <Badge variant="paid" className="text-xs">Bu sürüm</Badge>}
                <span className="text-sm font-normal text-muted-foreground">— {r.title}</span>
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">{r.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
