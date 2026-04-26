import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText, ChevronLeft, ChevronRight, Plus, Trash2, RefreshCw } from "lucide-react";
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
import { uploadDocument, processExtraction, getExtractionStatus, saveConfirmedData, replaceDocument } from "@/lib/dashboard.functions";
import { withAuth } from "@/lib/server-call";
import type { ExtractedData, ExtractedVisit, Circumferences, BodyComposition, DexaSegment, DexaSegmentKey } from "@/lib/types";

type Step = "upload" | "duplicate" | "processing" | "review" | "saving" | "error";

interface DuplicateInfo {
  documentId: string;
  originalName: string;
  uploadedAt: string;
  status: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  right_arm: "Braccio destro",
  left_arm: "Braccio sinistro",
  right_leg: "Gamba destra",
  left_leg: "Gamba sinistra",
  trunk: "Tronco",
};

const EMPTY_CIRC: Circumferences = {
  arm_cm: null, waist_cm: null, abdomen_cm: null, thigh_cm: null,
  hips_cm: null, chest_cm: null, neck_cm: null, forearm_cm: null, wrist_cm: null,
};
const EMPTY_BC: BodyComposition = {
  fat_mass_pct: null, lean_mass_kg: null, bone_mass_kg: null, bmi: null,
  metabolic_age: null, hydration_pct: null, visceral_fat: null,
};
const EMPTY_DEXA: DexaSegment[] = (["right_arm", "left_arm", "right_leg", "left_leg", "trunk"] as DexaSegmentKey[]).map(
  (segment) => ({ segment, fat_mass_pct: null, lean_mass_kg: null })
);

function makeEmptyVisit(): ExtractedVisit {
  return {
    visit_date: null,
    weight_kg: null,
    notes: null,
    circumferences: { ...EMPTY_CIRC },
    body_composition: { ...EMPTY_BC },
    dexa_segments: EMPTY_DEXA.map((s) => ({ ...s })),
  };
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 3 * 60 * 1000; // 3 minuti

export function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [data, setData] = useState<ExtractedData | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qc = useQueryClient();
  const uploadFnRaw = useServerFn(uploadDocument);
  const processFnRaw = useServerFn(processExtraction);
  const statusFnRaw = useServerFn(getExtractionStatus);
  const saveFnRaw = useServerFn(saveConfirmedData);
  const uploadFn = withAuth(uploadFnRaw);
  const processFn = withAuth(processFnRaw);
  const statusFn = withAuth(statusFnRaw);
  const saveFn = withAuth(saveFnRaw);

  const clearTimers = () => {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
  };

  const reset = () => {
    clearTimers();
    setStep("upload");
    setFile(null);
    setData(null);
    setDocumentId(null);
    setActiveIdx(0);
    setErrorMsg(null);
    setProcessingElapsed(0);
  };

  // Polling sullo status del documento
  const startPolling = (docId: string) => {
    clearTimers();
    const startedAt = Date.now();
    setProcessingElapsed(0);
    elapsedTimerRef.current = setInterval(() => {
      setProcessingElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    const poll = async () => {
      try {
        const res = await statusFn({ data: { documentId: docId } });
        if (res.status === "extracted" || res.status === "confirmed") {
          clearTimers();
          const ex = res.extracted;
          if (!ex) {
            setErrorMsg("L'estrazione si è conclusa ma non sono stati trovati dati.");
            setStep("error");
            return;
          }
          const visits = ex.visits && ex.visits.length > 0 ? ex.visits : [makeEmptyVisit()];
          setData({ ...ex, visits });
          setActiveIdx(0);
          setStep("review");
          return;
        }
        if (res.status === "failed") {
          clearTimers();
          setErrorMsg(res.error ?? "L'estrazione è fallita per un motivo sconosciuto.");
          setStep("error");
          return;
        }
        // pending o processing → continua
        if (Date.now() - startedAt > POLL_MAX_MS) {
          clearTimers();
          setErrorMsg("L'estrazione sta impiegando troppo tempo. Riprova oppure converti il file in .docx.");
          setStep("error");
          return;
        }
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        // errore di rete: continua a tentare finché non scade il timeout
        if (Date.now() - startedAt > POLL_MAX_MS) {
          clearTimers();
          setErrorMsg((e as Error).message);
          setStep("error");
          return;
        }
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    pollTimerRef.current = setTimeout(poll, 500);
  };

  useEffect(() => () => clearTimers(), []);

  const uploadMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return uploadFn({ data: fd });
    },
    onMutate: () => {
      setErrorMsg(null);
      setStep("processing");
    },
    onSuccess: (res) => {
      setDocumentId(res.documentId);
      // Fire-and-forget: avviamo il job ma non aspettiamo la risposta HTTP.
      // Anche se il proxy chiude la connessione, il job continua server-side
      // e il risultato viene scritto nel DB. Il polling lo recupera.
      processFn({ data: { documentId: res.documentId } }).catch(() => {
        // ignora: lo stato reale lo legge il polling dal DB
      });
      startPolling(res.documentId);
    },
    onError: (e: Error) => {
      setErrorMsg(e.message);
      setStep("error");
    },
  });

  const retryMut = useMutation({
    mutationFn: async (docId: string) => {
      processFn({ data: { documentId: docId } }).catch(() => { /* idem */ });
      return docId;
    },
    onMutate: () => {
      setErrorMsg(null);
      setStep("processing");
    },
    onSuccess: (docId) => {
      startPolling(docId);
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!documentId || !data) throw new Error("Dati mancanti");
      return saveFn({ data: { documentId, data } });
    },
    onMutate: () => setStep("saving"),
    onSuccess: (res) => {
      toast.success(`Salvate ${res.count} ${res.count === 1 ? "visita" : "visite"} dal referto.`);
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
    if (!o && step === "saving") return;
    if (!o && step === "processing") {
      // permettiamo la chiusura: il job continua sul server, l'utente potrà
      // ritrovare il documento nello storico (estratto o failed).
      clearTimers();
    }
    onOpenChange(o);
    if (!o) setTimeout(reset, 300);
  };

  const allDatesOk = data?.visits.every((v) => !!v.visit_date) ?? false;

  const updateVisit = (idx: number, patch: Partial<ExtractedVisit>) => {
    if (!data) return;
    const arr = data.visits.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    setData({ ...data, visits: arr });
  };

  const addVisit = () => {
    if (!data) return;
    const arr = [...data.visits, makeEmptyVisit()];
    setData({ ...data, visits: arr });
    setActiveIdx(arr.length - 1);
  };

  const removeVisit = (idx: number) => {
    if (!data) return;
    if (data.visits.length <= 1) {
      toast.error("Deve restare almeno una visita");
      return;
    }
    const arr = data.visits.filter((_, i) => i !== idx);
    setData({ ...data, visits: arr });
    setActiveIdx(Math.max(0, Math.min(activeIdx, arr.length - 1)));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Carica un nuovo referto"}
            {step === "processing" && "L'AI sta leggendo l'intero referto…"}
            {step === "review" && `Conferma i dati estratti${data ? ` · ${data.visits.length} ${data.visits.length === 1 ? "visita" : "visite"}` : ""}`}
            {step === "saving" && "Sto salvando…"}
            {step === "error" && "Estrazione non riuscita"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Carica il file (.doc, .docx, .pdf, .txt). Verranno estratte tutte le visite presenti."}
            {step === "processing" && "Può richiedere fino a 1–2 minuti per documenti complessi. Puoi chiudere questa finestra: il lavoro continua in background."}
            {step === "review" && "Naviga tra le visite con le frecce. Controlla e correggi i campi prima di salvarli."}
            {step === "error" && "Si è verificato un problema durante l'analisi del documento."}
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
                <p className="text-sm text-muted-foreground">.doc, .docx, .pdf o .txt — fino a 20MB</p>
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
                accept=".doc,.docx,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center space-y-1">
              <p className="font-medium">Sto analizzando il referto…</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {processingElapsed}s trascorsi
              </p>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4 py-6">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">Estrazione fallita</p>
                <p className="text-muted-foreground break-words">{errorMsg}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Suggerimento: i file <span className="font-mono">.docx</span> testuali sono i più veloci da analizzare. Per i <span className="font-mono">.doc</span> legacy, prova a riaprirli in Word/Pages e salvarli come <span className="font-mono">.docx</span>.
            </p>
          </div>
        )}

        {step === "review" && data && (
          <ScrollArea className="flex-1 pr-4">
            <ReviewForm
              data={data}
              activeIdx={activeIdx}
              onSelectVisit={setActiveIdx}
              onUpdateVisit={updateVisit}
              onAddVisit={addVisit}
              onRemoveVisit={removeVisit}
              onChange={setData}
            />
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
          {step === "processing" && (
            <Button variant="ghost" onClick={() => handleClose(false)}>
              Chiudi (continua in background)
            </Button>
          )}
          {step === "error" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Chiudi</Button>
              {documentId && (
                <Button onClick={() => retryMut.mutate(documentId)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Riprova estrazione
                </Button>
              )}
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Annulla</Button>
              <Button onClick={() => saveMut.mutate()} disabled={!allDatesOk}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Conferma e salva {data ? `(${data.visits.length})` : ""}
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

function ReviewForm({
  data,
  activeIdx,
  onSelectVisit,
  onUpdateVisit,
  onAddVisit,
  onRemoveVisit,
  onChange,
}: {
  data: ExtractedData;
  activeIdx: number;
  onSelectVisit: (idx: number) => void;
  onUpdateVisit: (idx: number, patch: Partial<ExtractedVisit>) => void;
  onAddVisit: () => void;
  onRemoveVisit: (idx: number) => void;
  onChange: (d: ExtractedData) => void;
}) {
  const visit = data.visits[activeIdx];
  const dateOk = !!visit?.visit_date;

  const setCirc = (patch: Partial<Circumferences>) =>
    onUpdateVisit(activeIdx, { circumferences: { ...visit.circumferences, ...patch } });
  const setBc = (patch: Partial<BodyComposition>) =>
    onUpdateVisit(activeIdx, { body_composition: { ...visit.body_composition, ...patch } });

  return (
    <div className="space-y-6 pb-2">
      {/* Navigatore tra visite */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectVisit(Math.max(0, activeIdx - 1))}
            disabled={activeIdx === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-wrap gap-1.5 justify-center flex-1">
            {data.visits.map((v, i) => {
              const isActive = i === activeIdx;
              const missing = !v.visit_date;
              return (
                <button
                  key={i}
                  onClick={() => onSelectVisit(i)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : missing
                        ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {v.visit_date ?? `#${i + 1} (data?)`}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectVisit(Math.min(data.visits.length - 1, activeIdx + 1))}
            disabled={activeIdx === data.visits.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-muted-foreground">
            Visita {activeIdx + 1} di {data.visits.length}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onAddVisit}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveVisit(activeIdx)}
              disabled={data.visits.length <= 1}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Rimuovi
            </Button>
          </div>
        </div>
      </div>

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
              value={visit.visit_date ?? ""}
              onChange={(e) => onUpdateVisit(activeIdx, { visit_date: e.target.value || null })}
              className="h-9"
            />
          </div>
          <NumField label="Peso" unit="kg" value={visit.weight_kg} onChange={(v) => onUpdateVisit(activeIdx, { weight_kg: v })} />
        </div>
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Note</Label>
          <Textarea
            rows={2}
            value={visit.notes ?? ""}
            onChange={(e) => onUpdateVisit(activeIdx, { notes: e.target.value || null })}
          />
        </div>
      </Section>

      <Section title="Circonferenze (cm)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumField label="Braccio" value={visit.circumferences.arm_cm} onChange={(v) => setCirc({ arm_cm: v })} />
          <NumField label="Vita" value={visit.circumferences.waist_cm} onChange={(v) => setCirc({ waist_cm: v })} />
          <NumField label="Addome" value={visit.circumferences.abdomen_cm} onChange={(v) => setCirc({ abdomen_cm: v })} />
          <NumField label="Coscia" value={visit.circumferences.thigh_cm} onChange={(v) => setCirc({ thigh_cm: v })} />
          <NumField label="Anche" value={visit.circumferences.hips_cm} onChange={(v) => setCirc({ hips_cm: v })} />
          <NumField label="Torace" value={visit.circumferences.chest_cm} onChange={(v) => setCirc({ chest_cm: v })} />
          <NumField label="Collo" value={visit.circumferences.neck_cm} onChange={(v) => setCirc({ neck_cm: v })} />
          <NumField label="Avambraccio" value={visit.circumferences.forearm_cm} onChange={(v) => setCirc({ forearm_cm: v })} />
          <NumField label="Polso" value={visit.circumferences.wrist_cm} onChange={(v) => setCirc({ wrist_cm: v })} />
        </div>
      </Section>

      <Section title="Composizione corporea">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumField label="Massa grassa" unit="%" value={visit.body_composition.fat_mass_pct} onChange={(v) => setBc({ fat_mass_pct: v })} />
          <NumField label="Massa magra" unit="kg" value={visit.body_composition.lean_mass_kg} onChange={(v) => setBc({ lean_mass_kg: v })} />
          <NumField label="Massa ossea" unit="kg" value={visit.body_composition.bone_mass_kg} onChange={(v) => setBc({ bone_mass_kg: v })} />
          <NumField label="BMI" value={visit.body_composition.bmi} onChange={(v) => setBc({ bmi: v })} />
          <NumField label="Età metabolica" unit="anni" step="1" value={visit.body_composition.metabolic_age} onChange={(v) => setBc({ metabolic_age: v })} />
          <NumField label="Idratazione" unit="%" value={visit.body_composition.hydration_pct} onChange={(v) => setBc({ hydration_pct: v })} />
          <NumField label="Grasso viscerale" value={visit.body_composition.visceral_fat} onChange={(v) => setBc({ visceral_fat: v })} />
        </div>
      </Section>

      <Section title="DEXA segmental">
        <div className="space-y-2">
          {visit.dexa_segments.map((s, i) => (
            <div key={s.segment + i} className="grid grid-cols-3 gap-3 items-end">
              <div className="text-sm font-medium pb-2">{SEGMENT_LABELS[s.segment] ?? s.segment}</div>
              <NumField
                label="Grasso %"
                value={s.fat_mass_pct}
                onChange={(v) => {
                  const arr = [...visit.dexa_segments];
                  arr[i] = { ...arr[i], fat_mass_pct: v };
                  onUpdateVisit(activeIdx, { dexa_segments: arr });
                }}
              />
              <NumField
                label="Magra kg"
                value={s.lean_mass_kg}
                onChange={(v) => {
                  const arr = [...visit.dexa_segments];
                  arr[i] = { ...arr[i], lean_mass_kg: v };
                  onUpdateVisit(activeIdx, { dexa_segments: arr });
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      {data.blood_tests.length > 0 && (
        <Section title={`Esami ematochimici (${data.blood_tests.length}) — globali al documento`}>
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
                      onChange({ ...data, blood_tests: arr });
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
                        onChange({ ...data, blood_tests: arr });
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
