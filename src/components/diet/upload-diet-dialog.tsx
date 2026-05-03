import { useMemo, useState } from "react";
import {
  Upload, Loader2, CheckCircle2, AlertCircle, FileText,
  Copy, Eraser, Plus, Trash2, ChevronDown,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  uploadDietDocument, confirmDietPlan,
  type DietPlanDraft, type WeeklyEntry, type MealSlot, type GuidelineItem, type MealOptions,
} from "@/lib/diet.functions";
import { withAuth } from "@/lib/server-call";

type Step = "upload" | "processing" | "review" | "saving" | "error";

const SLOTS: MealSlot[] = ["breakfast", "mid_morning", "lunch", "afternoon", "dinner"];
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Colazione",
  mid_morning: "Spuntino mattina",
  lunch: "Pranzo",
  afternoon: "Spuntino pomeriggio",
  dinner: "Cena",
};
const DAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Lun", long: "Lunedì" },
  { value: 2, short: "Mar", long: "Martedì" },
  { value: 3, short: "Mer", long: "Mercoledì" },
  { value: 4, short: "Gio", long: "Giovedì" },
  { value: 5, short: "Ven", long: "Venerdì" },
  { value: 6, short: "Sab", long: "Sabato" },
  { value: 7, short: "Dom", long: "Domenica" },
];

const MEAL_OPTION_GROUPS: { key: keyof MealOptions; label: string }[] = [
  { key: "breakfast_sweet", label: "Colazione dolce" },
  { key: "breakfast_savory", label: "Colazione salata" },
  { key: "snacks", label: "Spuntini" },
  { key: "first_courses", label: "Primi piatti" },
  { key: "second_courses_meat", label: "Secondi - Carne" },
  { key: "second_courses_fish", label: "Secondi - Pesce" },
  { key: "second_courses_eggs_cheese", label: "Secondi - Uova/Formaggio" },
  { key: "sides", label: "Contorni" },
  { key: "bread_equivalents", label: "Pane (equivalenti)" },
  { key: "cereal_equivalents", label: "Cereali (equivalenti)" },
  { key: "frequencies", label: "Frequenze settimanali" },
];

function todayDow(): number {
  // JS: Sun=0..Sat=6 → our 1=Mon..7=Sun
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

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
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
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
            {step === "review" && "Verifica e modifica i campi prima di salvare. Il piano precedente sarà archiviato."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {step === "upload" && (
            <div className="px-6 py-6">
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
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {step === "processing" ? "L'AI sta leggendo il piano…" : "Sto salvando…"}
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="px-6 py-6">
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
            <div className="h-full overflow-y-auto px-6 py-5">
              <ReviewForm draft={draft} onChange={setDraft} />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 sm:justify-between gap-2">
          {step === "review" && draft ? (
            <Summary draft={draft} />
          ) : <div />}
          <div className="flex items-center gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ draft }: { draft: DietPlanDraft }) {
  const filled = draft.weekly_schedule.filter((w) => (w.description ?? "").trim().length > 0).length;
  const optsCount = MEAL_OPTION_GROUPS.reduce((acc, g) => {
    const v = draft.meal_options[g.key] as unknown;
    return acc + (Array.isArray(v) ? v.length : 0);
  }, 0);
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{filled}</span>/35 celle ·{" "}
      <span className="font-medium text-foreground">{draft.general_guidelines.length}</span> indicazioni ·{" "}
      <span className="font-medium text-foreground">{optsCount}</span> opzioni
    </p>
  );
}

function ReviewForm({ draft, onChange }: { draft: DietPlanDraft; onChange: (d: DietPlanDraft) => void }) {
  const setField = <K extends keyof DietPlanDraft>(k: K, v: DietPlanDraft[K]) => onChange({ ...draft, [k]: v });
  const [activeDay, setActiveDay] = useState<string>(String(todayDow()));

  return (
    <div className="space-y-6">
      {/* Metadati */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Informazioni piano</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Titolo">
            <Input value={draft.title ?? ""} onChange={(e) => setField("title", e.target.value || null)} />
          </Field>
          <Field label="Calorie">
            <Input type="number" value={draft.kcal_target ?? ""} onChange={(e) => setField("kcal_target", e.target.value ? parseInt(e.target.value, 10) : null)} />
          </Field>
          <Field label="Data emissione">
            <Input type="date" value={draft.start_date ?? ""} onChange={(e) => setField("start_date", e.target.value || null)} />
          </Field>
          <Field label="Obiettivo" className="sm:col-span-2">
            <Input value={draft.objective ?? ""} onChange={(e) => setField("objective", e.target.value || null)} />
          </Field>
          <Field label="Dietologa">
            <Input value={draft.professional_name ?? ""} onChange={(e) => setField("professional_name", e.target.value || null)} />
          </Field>
        </div>
      </section>

      <Separator />

      {/* Schema settimanale */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Schema settimanale</h3>
            <p className="text-xs text-muted-foreground">Seleziona un giorno e modifica i pasti.</p>
          </div>
        </div>

        <Tabs value={activeDay} onValueChange={setActiveDay} className="w-full">
          <TabsList className="grid grid-cols-7 w-full">
            {DAYS.map((d) => (
              <TabsTrigger key={d.value} value={String(d.value)}>
                {d.short}
              </TabsTrigger>
            ))}
          </TabsList>

          {DAYS.map((d) => (
            <TabsContent key={d.value} value={String(d.value)} className="mt-4">
              <DayEditor
                day={d.value}
                dayLabel={d.long}
                draft={draft}
                onChange={(next) => setField("weekly_schedule", next)}
              />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <Separator />

      {/* Indicazioni & opzioni */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">Indicazioni & opzioni</h3>
        <Accordion type="multiple" className="rounded-lg border bg-card">
          <AccordionItem value="guidelines" className="border-b last:border-b-0">
            <AccordionTrigger className="px-4">
              Indicazioni generali
              <span className="ml-2 text-xs text-muted-foreground">({draft.general_guidelines.length})</span>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <GuidelinesEditor
                items={draft.general_guidelines}
                onChange={(items) => setField("general_guidelines", items)}
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="options">
            <AccordionTrigger className="px-4">
              Opzioni pasto
              <span className="ml-2 text-xs text-muted-foreground">
                ({MEAL_OPTION_GROUPS.reduce((a, g) => a + ((draft.meal_options[g.key] as unknown as unknown[])?.length ?? 0), 0)})
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <MealOptionsEditor
                options={draft.meal_options}
                onChange={(opts) => setField("meal_options", opts)}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DayEditor({
  day, dayLabel, draft, onChange,
}: {
  day: number;
  dayLabel: string;
  draft: DietPlanDraft;
  onChange: (next: WeeklyEntry[]) => void;
}) {
  const get = (slot: MealSlot) =>
    draft.weekly_schedule.find((w) => w.day_of_week === day && w.meal_slot === slot)?.description ?? "";

  const setSlot = (slot: MealSlot, value: string) => {
    const next = [...draft.weekly_schedule];
    const idx = next.findIndex((w) => w.day_of_week === day && w.meal_slot === slot);
    if (idx >= 0) next[idx] = { ...next[idx], description: value };
    else next.push({ day_of_week: day, meal_slot: slot, description: value });
    onChange(next);
  };

  const copyFrom = (sourceDay: number) => {
    const next = draft.weekly_schedule.filter((w) => w.day_of_week !== day);
    SLOTS.forEach((slot) => {
      const src = draft.weekly_schedule.find((w) => w.day_of_week === sourceDay && w.meal_slot === slot);
      if (src && (src.description ?? "").trim().length > 0) {
        next.push({ day_of_week: day, meal_slot: slot, description: src.description });
      }
    });
    onChange(next);
  };

  const clearDay = () => onChange(draft.weekly_schedule.filter((w) => w.day_of_week !== day));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{dayLabel}</h4>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copia da… <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Copia pasti dal giorno</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {DAYS.filter((d) => d.value !== day).map((d) => (
                  <DropdownMenuItem key={d.value} onClick={() => copyFrom(d.value)}>
                    {d.long}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={clearDay}>
              <Eraser className="mr-2 h-3.5 w-3.5" /> Svuota
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {SLOTS.map((slot) => (
            <div key={slot} className="space-y-1.5">
              <Label className="text-xs font-medium">{SLOT_LABELS[slot]}</Label>
              <Textarea
                value={get(slot)}
                rows={4}
                placeholder="Nessun pasto indicato"
                className="text-sm resize-y min-h-24"
                onChange={(e) => setSlot(slot, e.target.value)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GuidelinesEditor({
  items, onChange,
}: { items: GuidelineItem[]; onChange: (next: GuidelineItem[]) => void }) {
  const update = (i: number, patch: Partial<GuidelineItem>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { topic: "", text: "" }]);

  return (
    <div className="space-y-3 py-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Nessuna indicazione estratta.</p>
      )}
      {items.map((it, i) => (
        <div key={i} className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={it.topic}
              placeholder="Argomento"
              className="h-8 text-sm"
              onChange={(e) => update(i, { topic: e.target.value })}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <Textarea
            value={it.text}
            rows={2}
            placeholder="Descrizione"
            className="text-sm resize-y"
            onChange={(e) => update(i, { text: e.target.value })}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="mr-2 h-3.5 w-3.5" /> Aggiungi indicazione
      </Button>
    </div>
  );
}

function MealOptionsEditor({
  options, onChange,
}: { options: MealOptions; onChange: (next: MealOptions) => void }) {
  const updateList = (key: keyof MealOptions, list: string[]) => {
    onChange({ ...options, [key]: list } as MealOptions);
  };
  const groups = useMemo(() => MEAL_OPTION_GROUPS, []);

  return (
    <div className="space-y-4 py-2">
      {groups.map((g) => {
        const list = (options[g.key] as unknown as string[]) ?? [];
        return (
          <div key={g.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {g.label} <span className="text-muted-foreground">({list.length})</span>
              </Label>
              <Button variant="ghost" size="sm" onClick={() => updateList(g.key, [...list, ""])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi
              </Button>
            </div>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessuna opzione.</p>
            ) : (
              <div className="space-y-1.5">
                {list.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={val}
                      className="h-8 text-sm"
                      onChange={(e) => {
                        const next = [...list];
                        next[i] = e.target.value;
                        updateList(g.key, next);
                      }}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => updateList(g.key, list.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground italic">
        Le ricette estratte ({options.recipes?.length ?? 0}) sono salvate automaticamente e modificabili in seguito.
      </p>
    </div>
  );
}
