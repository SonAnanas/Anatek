import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ArchiveButton({ archived, label, onArchive, onRestore }: { archived: boolean; label: string; onArchive: () => void; onRestore: () => void }) {
  if (archived) return <Button variant="outline" onClick={onRestore}>Arşivden çıkar</Button>;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline">Arşivle</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} arşivlensin mi?</AlertDialogTitle>
          <AlertDialogDescription className="text-base">Kayıt silinmez; listelerde gizlenir ve istediğinizde geri alınabilir.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Vazgeç</AlertDialogCancel>
          <AlertDialogAction className="h-11" onClick={onArchive}>Arşivle</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
