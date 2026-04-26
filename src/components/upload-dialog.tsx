import { useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { uploadAndExtract, saveConfirmedData } from "@/lib/dashboard.functions";
import type { ExtractedData } from "@/lib/types";

type Step = "upload" | "extracting" | "review" | "saving";

const SEGMENT_LABELS: Record<string, string> = {
  right_arm: "Braccio destro",
  left_arm: "Braccio sinistro",
  right_leg: "Gamba destra",
  left_leg: "Gamba sinistra",
  trunk: "Tronco",
};

export function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [data, setData] = useState<ExtractedData | null>(null);
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadAndExtract);
  const saveFn = useServerFn(saveConfirmedData);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setData(null);
    setDocumentId(null);
  };

  const uploadMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return uploadFn({ data: fd });
    },
    onMutate: () => setStep("extracting"),
    onSuccess: (res) => {
      setDocumentId(res.documentId);
      setData(res.extracted);
      setStep("review");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStep("upload");
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!documentId || !data) throw new Error("Dati mancanti");
      return saveFn({ data: { documentId, data } });
    },
    onMutate: () => setStep("saving"),
    onSuccess: () => {
      toast.success("Visita salvata! Dashboard aggiornata.");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      setTimeout(reset, 300);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStep("review");
    },
  });

  const handleClose = (o: boolean) => {
    if (!o && (step === "extracting" || step === "saving")) return;
    onOpenChange(o);
    if (!o) setTimeout(reset, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Carica un nuovo referto"}
            {step === "extracting" && "L'AI sta leggendo il referto…"}
            {step === "review" && "Conferma i dati estratti"}
            {step === "saving" && "Sto salvando…"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Carica il file .doc o .docx che ti dà la dietologa."}
            {step === "review" && "Controlla e correggi i campi prima di salvarli."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <label
              htmlFor="file-input"
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
            >
              <Upload className="h-10 w-10 text-primary" />
              <div>
                <p className="font-medium">Clicca per selezionare un file</p>
                <p className="text-sm text-muted-foreground">.doc o .docx, fino a 20MB</p>
              </div>
              {file && (
                <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium">{file.name}</span>
                </div>
              )}
              <input
                id="file-input"
                type="file"
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {step === "extracting" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Estrazione in corso, può richiedere qualche secondo…</p>
          </div>
        )}

        {step === "review" && data && (
          <ScrollArea className="flex-1 pr-4">
            <ReviewForm data={data} onChange={setData} />
          </ScrollArea>
        )}

        {step === "saving" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Annulla</Button>
              <Button disabled={!file} onClick={() => file && uploadMut.mutate(file)}>
                Analizza con AI
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Annulla</Button>
              <Button onClick={() => saveMut.mutate()} disabled={!data?.visit.visit_date}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Conferma e salva
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───── Form di review ─────

function NumField({
  label,
  value,
  onChange,
  unit,
  step = "0.1",
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  unit?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}{unit ? ` (${unit})` : ""}</Label>
      <Input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        className="h-9"
      />
    </div>
  );
}

function ReviewForm({ data, onChange }: { data: ExtractedData; onChange: (d: ExtractedData) => void }) {
  const set = <K extends keyof ExtractedData>(key: K, value: ExtractedData[K]) => {
    onChange({ ...data, [key]: value });
  };

  const setVisit = (patch: Partial<ExtractedData["visit"]>) => set("visit", { ...data.visit, ...patch });
  const setCirc = (patch: Partial<ExtractedData["circumferences"]>) => set("circumferences", { ...data.circumferences, ...patch });
  const setBc = (patch: Partial<ExtractedData["body_composition"]>) => set("body_composition", { ...data.body_composition, ...patch });

  const dateOk = !!data.visit.visit_date;

  return (
    <div className="space-y-6 pb-2">
      {!dateOk && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/15 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-warning-foreground" />
          <span>Data della visita mancante: compilala per procedere.</span>
        </div>
      )}

      <Section title="Visita">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Data visita</Label>
            <Input
              type="date"
              value={data.visit.visit_date ?? ""}
              onChange={(e) => setVisit({ visit_date: e.target.value || null })}
              className="h-9"
            />
          </div>
          <NumField label="Peso" unit="kg" value={data.visit.weight_kg} onChange={(v) => setVisit({ weight_kg: v })} />
        </div>
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Note</Label>
          <Textarea
            rows={2}
            value={data.visit.notes ?? ""}
            onChange={(e) => setVisit({ notes: e.target.value || null })}
          />
        </div>
      </Section>

      <Section title="Circonferenze (cm)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumField label="Braccio" value={data.circumferences.arm_cm} onChange={(v) => setCirc({ arm_cm: v })} />
          <NumField label="Vita" value={data.circumferences.waist_cm} onChange={(v) => setCirc({ waist_cm: v })} />
          <NumField label="Addome" value={data.circumferences.abdomen_cm} onChange={(v) => setCirc({ abdomen_cm: v })} />
          <NumField label="Coscia" value={data.circumferences.thigh_cm} onChange={(v) => setCirc({ thigh_cm: v })} />
          <NumField label="Anche" value={data.circumferences.hips_cm} onChange={(v) => setCirc({ hips_cm: v })} />
          <NumField label="Torace" value={data.circumferences.chest_cm} onChange={(v) => setCirc({ chest_cm: v })} />
          <NumField label="Collo" value={data.circumferences.neck_cm} onChange={(v) => setCirc({ neck_cm: v })} />
          <NumField label="Avambraccio" value={data.circumferences.forearm_cm} onChange={(v) => setCirc({ forearm_cm: v })} />
          <NumField label="Polso" value={data.circumferences.wrist_cm} onChange={(v) => setCirc({ wrist_cm: v })} />
        </div>
      </Section>

      <Section title="Composizione corporea">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumField label="Massa grassa" unit="%" value={data.body_composition.fat_mass_pct} onChange={(v) => setBc({ fat_mass_pct: v })} />
          <NumField label="Massa magra" unit="kg" value={data.body_composition.lean_mass_kg} onChange={(v) => setBc({ lean_mass_kg: v })} />
          <NumField label="Massa ossea" unit="kg" value={data.body_composition.bone_mass_kg} onChange={(v) => setBc({ bone_mass_kg: v })} />
          <NumField label="BMI" value={data.body_composition.bmi} onChange={(v) => setBc({ bmi: v })} />
          <NumField label="Età metabolica" unit="anni" step="1" value={data.body_composition.metabolic_age} onChange={(v) => setBc({ metabolic_age: v })} />
          <NumField label="Idratazione" unit="%" value={data.body_composition.hydration_pct} onChange={(v) => setBc({ hydration_pct: v })} />
          <NumField label="Grasso viscerale" value={data.body_composition.visceral_fat} onChange={(v) => setBc({ visceral_fat: v })} />
        </div>
      </Section>

      <Section title="DEXA segmental">
        <div className="space-y-2">
          {data.dexa_segments.map((s, i) => (
            <div key={s.segment + i} className="grid grid-cols-3 gap-3 items-end">
              <div className="text-sm font-medium pb-2">{SEGMENT_LABELS[s.segment] ?? s.segment}</div>
              <NumField
                label="Grasso %"
                value={s.fat_mass_pct}
                onChange={(v) => {
                  const arr = [...data.dexa_segments];
                  arr[i] = { ...arr[i], fat_mass_pct: v };
                  set("dexa_segments", arr);
                }}
              />
              <NumField
                label="Magra kg"
                value={s.lean_mass_kg}
                onChange={(v) => {
                  const arr = [...data.dexa_segments];
                  arr[i] = { ...arr[i], lean_mass_kg: v };
                  set("dexa_segments", arr);
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      {data.blood_tests.length > 0 && (
        <Section title="Esami ematochimici">
          <div className="space-y-4">
            {data.blood_tests.map((t, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Data esame</Label>
                  <Input
                    type="date"
                    value={t.test_date ?? ""}
                    onChange={(e) => {
                      const arr = [...data.blood_tests];
                      arr[i] = { ...arr[i], test_date: e.target.value };
                      set("blood_tests", arr);
                    }}
                    className="h-9 max-w-xs"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(["hemoglobin", "glucose", "gamma_gt", "alt", "ast", "total_cholesterol", "hdl", "ldl", "triglycerides"] as const).map((k) => (
                    <NumField
                      key={k}
                      label={LABELS[k]}
                      value={t[k]}
                      onChange={(v) => {
                        const arr = [...data.blood_tests];
                        arr[i] = { ...arr[i], [k]: v };
                        set("blood_tests", arr);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

const LABELS: Record<string, string> = {
  hemoglobin: "Emoglobina",
  glucose: "Glicemia",
  gamma_gt: "Gamma GT",
  alt: "ALT",
  ast: "AST",
  total_cholesterol: "Colesterolo tot.",
  hdl: "HDL",
  ldl: "LDL",
  triglycerides: "Trigliceridi",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Separator />
      {children}
    </div>
  );
}
