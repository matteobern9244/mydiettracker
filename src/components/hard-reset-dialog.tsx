import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HardResetDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) setText("");
  }, [open]);

  const canConfirm = text.trim().toUpperCase() === "RESET";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Hard reset totale
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Verranno cancellati definitivamente:
            </span>
            <ul className="list-disc pl-5 text-sm">
              <li>tutte le visite e le pesate</li>
              <li>tutti gli esami ematochimici</li>
              <li>tutte le composizioni corporee e DEXA</li>
              <li>tutti i file caricati nello storage</li>
              <li>tutti i dati anagrafici e l'obiettivo di peso</li>
            </ul>
            <span className="block font-semibold text-destructive">
              Operazione irreversibile.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Per confermare, scrivi <span className="font-mono font-semibold text-foreground">RESET</span> nel campo qui sotto:
          </Label>
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="RESET"
            disabled={loading}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (canConfirm && !loading) onConfirm();
            }}
            disabled={!canConfirm || loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancellazione…
              </>
            ) : (
              "Cancella tutto"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
