import { useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { uploadDietDocument, confirmDietPlan, type DietPlanDraft } from "@/lib/diet.functions";
import { withAuth } from "@/lib/server-call";

type Step = "upload" | "processing" | "review" | "saving" | "error";

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Colazione",
  mid_morning: "Spuntino mattina",
  lunch: "Pranzo",
  afternoon: "Spuntino pomeriggio",
  dinner: "Cena",
};
const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function UploadDietDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<DietPlanDraft | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const uploadFn = withAuth(useServerFn(uploadDietDocument));
  const confirmFn = withAuth(useServerFn(confirmDietPlan));

  const reset = () => {
    setStep("upload"); setFile(null); setDraft(null); setDocumentId(null); setErrorMsg(null);
  };

  const uploadMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return uploadFn({ data: fd });
    },
    onMutate: () => { setErrorMsg(null); setStep("processing"); },
    onSuccess: (res) => {
      setDocumentId(res.documentId);
      setDraft(res.draft as DietPlanDraft);
      setStep("review");
    },
    onError: (e: Error) => { setErrorMsg(e.message); setStep("error"); },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!documentId || !draft) throw new Error("Dati mancanti");
      return confirmFn({ data: { documentId, draft } });
    },
    onMutate: () => setStep("saving"),
    onSuccess: () => {
      toast.success("Piano alimentare salvato.");
      qc.invalidateQueries({ queryKey: ["dietPlan"] });
      onOpenChange(false);
      setTimeout(reset, 300);
    },
    onError: (e: Error) => { toast.error(e.message); setStep("review"); },
  });

  const handleClose = (o: boolean) => {
    if (!o && (step === "saving" || step === "processing")) return;
    onOpenChange(o);
    if (!o) setTimeout(reset, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Carica il tuo piano alimentare"}
            {step === "processing" && "Estrazione in corso…"}
            {step === "review" && "Conferma il piano estratto"}
            {step === "saving" && "Salvataggio…"}
            {step === "error" && "Estrazione non riuscita"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "File .docx, .pdf, .doc o .txt fino a 20MB. L'AI estrae meta, schema settimanale, opzioni e indicazioni."}
            {step === "processing" && "Può richiedere fino a 1–2 minuti."}
            {step === "review" && "Verifica i campi prima di salvare. Il piano precedente sarà archiviato."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="py-4">
            <label htmlFor="diet-file" className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors">
              <Upload className="h-10 w-10 text-primary" />
              <div>
                <p className="font-medium">Clicca per selezionare il documento</p>
                <p className="text-sm text-muted-foreground">.doc, .docx, .pdf, .txt — max 20MB</p>
              </div>
              {file && (
                <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" /><span className="font-medium">{file.name}</span>
                </div>
              )}
              <input id="diet-file" type="file" className="hidden"
                accept=".doc,.docx,.pdf,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        )}

        {(step === "processing" || step === "saving") && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {step === "processing" ? "L'AI sta leggendo il piano…" : "Sto salvando…"}
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="py-6">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Estrazione fallita</p>
                <p className="text-muted-foreground break-words">{errorMsg}</p>
              </div>
            </div>
          </div>
        )}

        {step === "review" && draft && (
          <ScrollArea className="flex-1 pr-4">
            <ReviewForm draft={draft} onChange={setDraft} />
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Annulla</Button>
              <Button disabled={!file} onClick={() => file && uploadMut.mutate(file)}>Analizza con AI</Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Annulla</Button>
              <Button onClick={() => saveMut.mutate()}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Conferma e salva
              </Button>
            </>
          )}
          {step === "error" && <Button variant="ghost" onClick={() => handleClose(false)}>Chiudi</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({ draft, onChange }: { draft: DietPlanDraft; onChange: (d: DietPlanDraft) => void }) {
  const setField = <K extends keyof DietPlanDraft>(k: K, v: DietPlanDraft[K]) => onChange({ ...draft, [k]: v });

  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Titolo</Label>
          <Input value={draft.title ?? ""} onChange={(e) => setField("title", e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs">Calorie</Label>
          <Input type="number" value={draft.kcal_target ?? ""} onChange={(e) => setField("kcal_target", e.target.value ? parseInt(e.target.value, 10) : null)} />
        </div>
        <div>
          <Label className="text-xs">Obiettivo</Label>
          <Input value={draft.objective ?? ""} onChange={(e) => setField("objective", e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs">Dietologa</Label>
          <Input value={draft.professional_name ?? ""} onChange={(e) => setField("professional_name", e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs">Data emissione</Label>
          <Input type="date" value={draft.start_date ?? ""} onChange={(e) => setField("start_date", e.target.value || null)} />
        </div>
      </div>

      <Separator />
      <div>
        <h3 className="text-sm font-semibold mb-2">Schema settimanale ({draft.weekly_schedule.length} celle estratte)</h3>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Pasto</th>
                {DAY_LABELS.map((d) => <th key={d} className="p-2 text-center">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {(["breakfast", "mid_morning", "lunch", "afternoon", "dinner"] as const).map((slot) => (
                <tr key={slot} className="border-t">
                  <td className="p-2 font-medium align-top">{SLOT_LABELS[slot]}</td>
                  {DAY_LABELS.map((_, i) => {
                    const dow = i + 1;
                    const idx = draft.weekly_schedule.findIndex((w) => w.day_of_week === dow && w.meal_slot === slot);
                    const desc = idx >= 0 ? draft.weekly_schedule[idx].description : "";
                    return (
                      <td key={i} className="p-1 align-top border-l">
                        <Textarea
                          value={desc}
                          rows={2}
                          className="text-xs min-h-[3rem]"
                          onChange={(e) => {
                            const next = [...draft.weekly_schedule];
                            if (idx >= 0) {
                              next[idx] = { ...next[idx], description: e.target.value };
                            } else {
                              next.push({ day_of_week: dow, meal_slot: slot, description: e.target.value });
                            }
                            setField("weekly_schedule", next);
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Indicazioni generali ({draft.general_guidelines.length}) e opzioni pasto sono state estratte e salvate automaticamente.
        Potrai modificarle in seguito.
      </p>
    </div>
  );
}
