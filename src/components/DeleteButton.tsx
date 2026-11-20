import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteCustomer, deleteVehicle, deleteWorkOrder, describeDeleteCounts, previewDeleteCustomer, previewDeleteVehicle, previewDeleteWorkOrder, undoLastDelete, type DeleteCounts,
} from "@/lib/repository";

type Kind = "customer" | "vehicle" | "workOrder";
const OPS: Record<Kind, { preview: (id: string) => DeleteCounts; del: (id: string) => DeleteCounts }> = {
  customer: { preview: previewDeleteCustomer, del: deleteCustomer },
  vehicle: { preview: previewDeleteVehicle, del: deleteVehicle },
  workOrder: { preview: previewDeleteWorkOrder, del: deleteWorkOrder },
};

export function undoLastDeleteWithToast() {
  try { undoLastDelete(); toast.success("Son silme geri alındı."); }
  catch (e) { toast.error(e instanceof Error ? e.message : "Geri alınamadı."); }
}

/** Kalıcı silme: iki ayrı onay; ikinci onay 2 sn sonra aktif olur, Enter ile onaylanmaz. */
export function DeleteButton({ kind, id, label, onDeleted, size }: { kind: Kind; id: string; label: string; onDeleted?: () => void; size?: "sm" | "default" }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [counts, setCounts] = useState<DeleteCounts | null>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (step !== 2) { setArmed(false); return; }
    const t = setTimeout(() => setArmed(true), 2000);
    return () => clearTimeout(t);
  }, [step]);

  const confirm = () => {
    try {
      OPS[kind].del(id);
      setStep(0);
      onDeleted?.();
      toast.success("Silindi.", { duration: 10000, action: { label: "Geri almak için tıklayın", onClick: undoLastDeleteWithToast } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Silinemedi."); }
  };

  return (
    <>
      <Button type="button" variant="destructive" size={size} onClick={(e) => { e.stopPropagation(); setStep(1); }}>Sil</Button>
      <AlertDialog open={step === 1} onOpenChange={(o) => !o && setStep(0)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{label} kaydını silmek istiyor musunuz?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
            <Button className="h-11" variant="destructive" onClick={() => { setCounts(OPS[kind].preview(id)); setStep(2); }}>Devam</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={step === 2} onOpenChange={(o) => !o && setStep(0)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Bu işlem GERİ ALINAMAZ.</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground">Silinecekler: {counts && describeDeleteCounts(counts)}.</AlertDialogDescription>
          </AlertDialogHeader>
          {counts && counts.payments > 0 && (
            <p className="rounded-md border-2 border-destructive p-3 font-semibold text-destructive">Silinen ödemeler gelir raporlarından da çıkacaktır.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" autoFocus>Vazgeç</AlertDialogCancel>
            <Button className="h-11" variant="destructive" disabled={!armed} onClick={(e) => { if (e.detail === 0) return; confirm(); }}>
              {armed ? "Evet, kalıcı olarak sil" : "Evet, kalıcı olarak sil (2 sn)"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
