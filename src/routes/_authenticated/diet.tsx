import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, Upload, ArrowLeft, ChevronLeft, ChevronRight, BookOpen, ListChecks,
  ShoppingCart, CalendarDays, Loader2, Trash2, Check, RefreshCw, GripVertical,
  AlertTriangle, Eraser, Pencil, Printer,
} from "lucide-react";
import { printShoppingList } from "@/lib/print-shopping";
import { toast } from "sonner";
import {
  DndContext, type DragEndEvent, DragOverlay, type DragStartEvent,
  PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, MeasuringStrategy,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { withAuth } from "@/lib/server-call";
import {
  getActiveDietPlan, toggleMealLog, generateShoppingList, getShoppingList,
  updateShoppingList, deleteActiveDietPlan, updateScheduleCell, clearShoppingList,
  resetDietData, MEAL_SLOTS, type MealSlot, type MealOptions,
  type GuidelineItem, type ShoppingItem,
} from "@/lib/diet.functions";
import { UploadDietDialog } from "@/components/diet/upload-diet-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

const dietSearchSchema = z.object({
  view: fallback(z.enum(["week", "day"]).optional(), undefined),
  date: fallback(z.string().optional(), undefined),
  tab: fallback(z.enum(["calendar", "options", "guidelines", "shopping"]), "calendar").default("calendar"),
});

export const Route = createFileRoute("/_authenticated/diet")({
  validateSearch: zodValidator(dietSearchSchema),
  component: DietPage,
  head: () => ({
    meta: [{ title: "Dieta · My Diet Tracker" }, { name: "description", content: "Piano alimentare in stile calendario." }],
  }),
});

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Colazione",
  mid_morning: "Spuntino mattina",
  lunch: "Pranzo",
  afternoon: "Spuntino pomeriggio",
  dinner: "Cena",
};
const SLOT_LABEL_SHORT: Record<MealSlot, string> = {
  breakfast: "Colaz.",
  mid_morning: "Sp. mat.",
  lunch: "Pranzo",
  afternoon: "Sp. pom.",
  dinner: "Cena",
};
const DAY_LABEL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAY_LABEL_LONG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseIsoDateLocal(value: string | undefined, fallbackDate: Date): Date {
  if (!value) return fallbackDate;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return fallbackDate;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
function startOfWeek(d: Date): Date {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d: Date, n: number): Date {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt;
}
function getDow(d: Date): number { return ((d.getDay() + 6) % 7) + 1; }

type CellId = `${number}:${MealSlot}`;
const cellId = (dow: number, slot: MealSlot): CellId => `${dow}:${slot}` as CellId;
const parseCellId = (id: string): { dow: number; slot: MealSlot } => {
  const [d, s] = id.split(":");
  return { dow: Number(d), slot: s as MealSlot };
};

function DietPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isMobile = useIsMobile();
  const view = search.view ?? (isMobile ? "day" : "week");
  const tab = search.tab;
  const today = useMemo(() => new Date(), []);
  const currentDate = parseIsoDateLocal(search.date, today);
  const weekStart = startOfWeek(currentDate);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const qc = useQueryClient();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const getPlanFn = withAuth(useServerFn(getActiveDietPlan));
  const toggleLogFn = withAuth(useServerFn(toggleMealLog));
  const genShopFn = withAuth(useServerFn(generateShoppingList));
  const getShopFn = withAuth(useServerFn(getShoppingList));
  const updShopFn = withAuth(useServerFn(updateShoppingList));
  const clearShopFn = withAuth(useServerFn(clearShoppingList));
  const delPlanFn = withAuth(useServerFn(deleteActiveDietPlan));
  const updCellFn = withAuth(useServerFn(updateScheduleCell));
  const resetDietFn = withAuth(useServerFn(resetDietData));

  const planQuery = useQuery({
    queryKey: ["dietPlan", user?.id ?? "anon"],
    queryFn: () => getPlanFn(),
    enabled: !authLoading && isAuthenticated && !!user?.id,
  });

  const plan = planQuery.data?.plan as null | {
    id: string; title: string | null; objective: string | null; professional_name: string | null;
    kcal_target: number | null; start_date: string | null;
    general_guidelines: GuidelineItem[]; meal_options: MealOptions;
  };
  const schedule = (planQuery.data?.schedule ?? []) as Array<{
    day_of_week: number; meal_slot: MealSlot; description: string;
  }>;
  const logs = (planQuery.data?.logs ?? []) as Array<{
    log_date: string; meal_slot: MealSlot; consumed: boolean;
  }>;

  const scheduleMap = useMemo(() => {
    const map: Record<number, Partial<Record<MealSlot, string>>> = {};
    for (const r of schedule) {
      if (!map[r.day_of_week]) map[r.day_of_week] = {};
      map[r.day_of_week]![r.meal_slot] = r.description;
    }
    return map;
  }, [schedule]);

  const logsMap = useMemo(() => {
    const map: Record<string, Partial<Record<MealSlot, boolean>>> = {};
    for (const l of logs) {
      if (!map[l.log_date]) map[l.log_date] = {};
      map[l.log_date]![l.meal_slot] = l.consumed;
    }
    return map;
  }, [logs]);

  const toggleMut = useMutation({
    mutationFn: async (vars: { logDate: string; mealSlot: MealSlot; consumed: boolean }) =>
      toggleLogFn({ data: { ...vars, planId: plan?.id ?? null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dietPlan"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Schedule edits (drag&drop, manual edit). Optimistic update + invalidate.
  const editCell = async (dow: number, slot: MealSlot, description: string) => {
    if (!plan) return;
    // optimistic
    const prev = planQuery.data;
    qc.setQueryData(["dietPlan", user?.id ?? "anon"], (old: typeof prev) => {
      if (!old) return old;
      const filtered = (old.schedule as typeof schedule).filter(
        (s) => !(s.day_of_week === dow && s.meal_slot === slot),
      );
      const next = description.trim()
        ? [...filtered, { day_of_week: dow, meal_slot: slot, description }]
        : filtered;
      return { ...old, schedule: next };
    });
    try {
      await updCellFn({ data: { planId: plan.id, dayOfWeek: dow, mealSlot: slot, description } });
    } catch (e) {
      qc.setQueryData(["dietPlan", user?.id ?? "anon"], prev);
      toast.error((e as Error).message);
    } finally {
      qc.invalidateQueries({ queryKey: ["dietPlan"] });
    }
  };

  const setView = (v: "week" | "day") => navigate({ search: (s: Record<string, unknown>) => ({ ...s, view: v }) as never });
  const setTab = (t: typeof tab) => navigate({ search: (s: Record<string, unknown>) => ({ ...s, tab: t }) as never });
  const setDate = (d: Date) => navigate({ search: (s: Record<string, unknown>) => ({ ...s, date: isoDate(d) }) as never, replace: true });

  const weeklyAdherence = useMemo(() => {
    let total = 0, done = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dateStr = isoDate(d);
      for (const slot of MEAL_SLOTS) {
        if (scheduleMap[i + 1]?.[slot]) {
          total++;
          if (logsMap[dateStr]?.[slot]) done++;
        }
      }
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [weekStart, scheduleMap, logsMap]);

  if (planQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[image:var(--gradient-soft)]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)] shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-none truncate">Dieta</h1>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {plan?.title ?? "Nessun piano attivo"}
                {plan?.kcal_target ? ` · ${plan.kcal_target} kcal` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {plan && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Aderenza settimana: {weeklyAdherence}%
              </Badge>
            )}
            <Button onClick={() => setUploadOpen(true)} className="rounded-full">
              <Upload className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{plan ? "Cambia piano" : "Carica piano"}</span>
              <span className="sm:hidden">{plan ? "Cambia" : "Carica"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {!plan ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-2xl bg-primary/10 p-4">
                <CalendarDays className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Nessun piano alimentare attivo</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Carica il documento della tua dietologa (.docx, .pdf): l'AI estrarrà schema settimanale,
                  opzioni pasto e indicazioni generali.
                </p>
              </div>
              <Button onClick={() => setUploadOpen(true)} size="lg" className="rounded-full">
                <Upload className="mr-2 h-4 w-4" />
                Carica piano alimentare
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Cancella tutti i dati Dieta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
              <TabsTrigger value="calendar"><CalendarDays className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Calendario</span></TabsTrigger>
              <TabsTrigger value="options"><ListChecks className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Opzioni</span></TabsTrigger>
              <TabsTrigger value="guidelines"><BookOpen className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Indicazioni</span></TabsTrigger>
              <TabsTrigger value="shopping"><ShoppingCart className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Spesa</span></TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  <Button size="sm" variant={view === "week" ? "default" : "ghost"} onClick={() => setView("week")}>
                    Settimana
                  </Button>
                  <Button size="sm" variant={view === "day" ? "default" : "ghost"} onClick={() => setView("day")}>
                    Giorno
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setDate(addDays(currentDate, view === "week" ? -7 : -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDate(today)}>Oggi</Button>
                  <Button size="icon" variant="outline" onClick={() => setDate(addDays(currentDate, view === "week" ? 7 : 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Suggerimento: trascina una cella per <strong>spostarla</strong>; tieni premuto <kbd className="rounded bg-muted px-1">Alt</kbd> per <strong>copiare</strong>. Clicca sulla matita per modificare il testo.
              </p>

              {view === "week" ? (
                <ScheduleBoard
                  variant="week"
                  weekStart={weekStart}
                  today={today}
                  scheduleMap={scheduleMap}
                  logsMap={logsMap}
                  onToggle={(date, slot, consumed) => toggleMut.mutate({ logDate: date, mealSlot: slot, consumed })}
                  onCellEdit={editCell}
                />
              ) : (
                <ScheduleBoard
                  variant="day"
                  weekStart={weekStart}
                  today={today}
                  date={currentDate}
                  scheduleMap={scheduleMap}
                  logsMap={logsMap}
                  onToggle={(date, slot, consumed) => toggleMut.mutate({ logDate: date, mealSlot: slot, consumed })}
                  onCellEdit={editCell}
                />
              )}
            </TabsContent>

            <TabsContent value="options" className="mt-4">
              <OptionsView options={plan.meal_options} />
            </TabsContent>

            <TabsContent value="guidelines" className="mt-4">
              <GuidelinesView guidelines={plan.general_guidelines} />
            </TabsContent>

            <TabsContent value="shopping" className="mt-4">
              <ShoppingView
                weekStart={isoDate(weekStart)}
                onGenerate={(targetWeekStart: string) => genShopFn({ data: { weekStart: targetWeekStart } })}
                onLoad={(targetWeekStart: string) => getShopFn({ data: { weekStart: targetWeekStart } })}
                onSave={(targetWeekStart: string, items: ShoppingItem[]) => updShopFn({ data: { weekStart: targetWeekStart, items } })}
                onClear={(targetWeekStart: string) => clearShopFn({ data: { weekStart: targetWeekStart } })}
              />
            </TabsContent>
          </Tabs>
        )}

        {plan && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Gestione piano</CardTitle>
              <CardDescription>
                {plan.professional_name && `Dietologa: ${plan.professional_name} · `}
                {plan.start_date && `Emissione: ${new Date(plan.start_date).toLocaleDateString("it-IT")}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm("Eliminare il piano attivo? Lo schema settimanale verrà rimosso (i log restano).")) return;
                  await delPlanFn();
                  qc.invalidateQueries({ queryKey: ["dietPlan"] });
                  toast.success("Piano eliminato.");
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Elimina piano attivo
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setResetOpen(true)}>
                <AlertTriangle className="mr-2 h-4 w-4" /> Cancella tutti i dati Dieta
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <UploadDietDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ResetDietDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={async () => {
          await resetDietFn();
          qc.invalidateQueries({ queryKey: ["dietPlan"] });
          toast.success("Tutti i dati Dieta sono stati cancellati.");
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule board: una sola matrice (con DnD) — variante settimana/giorno
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleBoard({
  variant, weekStart, today, date, scheduleMap, logsMap, onToggle, onCellEdit,
}: {
  variant: "week" | "day";
  weekStart: Date;
  today: Date;
  date?: Date;
  scheduleMap: Record<number, Partial<Record<MealSlot, string>>>;
  logsMap: Record<string, Partial<Record<MealSlot, boolean>>>;
  onToggle: (date: string, slot: MealSlot, consumed: boolean) => void;
  onCellEdit: (dow: number, slot: MealSlot, description: string) => Promise<void> | void;
}) {
  const isMobile = useIsMobile();
  const [activeDrag, setActiveDrag] = useState<{ id: CellId; desc: string } | null>(null);
  const [editing, setEditing] = useState<{ dow: number; slot: MealSlot; value: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const todayStr = isoDate(today);

  const handleStart = (e: DragStartEvent) => {
    const { dow, slot } = parseCellId(String(e.active.id));
    setActiveDrag({ id: e.active.id as CellId, desc: scheduleMap[dow]?.[slot] ?? "" });
  };

  const handleEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    if (!e.over || e.active.id === e.over.id) return;
    const src = parseCellId(String(e.active.id));
    const dst = parseCellId(String(e.over.id));
    const srcDesc = scheduleMap[src.dow]?.[src.slot] ?? "";
    const dstDesc = scheduleMap[dst.dow]?.[dst.slot] ?? "";
    if (!srcDesc) return;
    const isCopy =
      (e.activatorEvent as MouseEvent | KeyboardEvent | TouchEvent | undefined) instanceof MouseEvent &&
      (e.activatorEvent as MouseEvent).altKey;

    if (isCopy) {
      await onCellEdit(dst.dow, dst.slot, srcDesc);
      toast.success("Pasto copiato.");
      return;
    }
    // Move (swap if dst has content)
    await Promise.all([
      onCellEdit(dst.dow, dst.slot, srcDesc),
      onCellEdit(src.dow, src.slot, dstDesc),
    ]);
    toast.success(dstDesc ? "Pasti scambiati." : "Pasto spostato.");
  };

  // Render days array depending on variant + mobile
  const days = variant === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [date ?? new Date()];

  const showAsCards = isMobile || variant === "day";

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      {showAsCards ? (
        <DayCardsView
          days={days}
          todayStr={todayStr}
          scheduleMap={scheduleMap}
          logsMap={logsMap}
          onToggle={onToggle}
          onEdit={(dow, slot, value) => setEditing({ dow, slot, value })}
        />
      ) : (
        <DesktopGridView
          days={days}
          todayStr={todayStr}
          scheduleMap={scheduleMap}
          logsMap={logsMap}
          onToggle={onToggle}
          onEdit={(dow, slot, value) => setEditing({ dow, slot, value })}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="rounded-lg border bg-card shadow-2xl p-3 max-w-xs text-xs leading-snug">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5 text-[10px] uppercase tracking-wider">
              <GripVertical className="h-3 w-3" />Sposta pasto
            </div>
            <p className="line-clamp-4">{activeDrag.desc || "(vuoto)"}</p>
          </div>
        ) : null}
      </DragOverlay>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifica pasto</DialogTitle>
              <DialogDescription>
                {DAY_LABEL_LONG[editing.dow - 1]} · {SLOT_LABEL[editing.slot]}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              autoFocus
              rows={6}
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              placeholder="Descrizione del pasto…"
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button>
              <Button
                onClick={async () => {
                  await onCellEdit(editing.dow, editing.slot, editing.value);
                  setEditing(null);
                  toast.success("Pasto aggiornato.");
                }}
              >Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DndContext>
  );
}

function DesktopGridView({
  days, todayStr, scheduleMap, logsMap, onToggle, onEdit,
}: {
  days: Date[];
  todayStr: string;
  scheduleMap: Record<number, Partial<Record<MealSlot, string>>>;
  logsMap: Record<string, Partial<Record<MealSlot, boolean>>>;
  onToggle: (date: string, slot: MealSlot, consumed: boolean) => void;
  onEdit: (dow: number, slot: MealSlot, value: string) => void;
}) {
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[140px_repeat(7,minmax(0,1fr))] border-b bg-muted/30 sticky top-0 z-10">
            <div className="p-3 text-xs font-semibold text-muted-foreground">Pasto</div>
            {days.map((d, i) => {
              const isToday = isoDate(d) === todayStr;
              return (
                <div
                  key={i}
                  className={`p-3 text-center text-sm font-semibold border-l ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  <div>{DAY_LABEL[i]}</div>
                  <div className="text-xs opacity-70 font-normal">{d.getDate()}/{d.getMonth() + 1}</div>
                </div>
              );
            })}
          </div>
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="grid grid-cols-[140px_repeat(7,minmax(0,1fr))] border-b last:border-b-0">
              <div className="p-3 text-sm font-medium bg-muted/20 flex items-center">{SLOT_LABEL[slot]}</div>
              {days.map((d, i) => {
                const dow = i + 1;
                const desc = scheduleMap[dow]?.[slot] ?? "";
                const dateStr = isoDate(d);
                const consumed = !!logsMap[dateStr]?.[slot];
                const isToday = dateStr === todayStr;
                return (
                  <DraggableCell
                    key={i}
                    id={cellId(dow, slot)}
                    desc={desc}
                    consumed={consumed}
                    isToday={isToday}
                    onToggle={() => onToggle(dateStr, slot, !consumed)}
                    onEdit={() => onEdit(dow, slot, desc)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DayCardsView({
  days, todayStr, scheduleMap, logsMap, onToggle, onEdit,
}: {
  days: Date[];
  todayStr: string;
  scheduleMap: Record<number, Partial<Record<MealSlot, string>>>;
  logsMap: Record<string, Partial<Record<MealSlot, boolean>>>;
  onToggle: (date: string, slot: MealSlot, consumed: boolean) => void;
  onEdit: (dow: number, slot: MealSlot, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {days.map((d) => {
        const dow = getDow(d);
        const dateStr = isoDate(d);
        const isToday = dateStr === todayStr;
        return (
          <Card key={dateStr} className={isToday ? "ring-2 ring-primary/40" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{DAY_LABEL_LONG[dow - 1]}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {d.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {MEAL_SLOTS.map((slot) => {
                const desc = scheduleMap[dow]?.[slot] ?? "";
                const consumed = !!logsMap[dateStr]?.[slot];
                return (
                  <div key={slot} className="rounded-lg border bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {SLOT_LABEL[slot]}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(dow, slot, desc)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <DraggableCellInline
                      id={cellId(dow, slot)}
                      desc={desc}
                      consumed={consumed}
                      onToggle={() => onToggle(dateStr, slot, !consumed)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DraggableCell({
  id, desc, consumed, isToday, onToggle, onEdit,
}: {
  id: CellId;
  desc: string;
  consumed: boolean;
  isToday: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setDropRef}
      className={`relative p-2 text-sm border-l transition-colors group ${isToday ? "bg-primary/5" : ""} ${isOver ? "bg-primary/15 ring-2 ring-primary/50 ring-inset" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      {desc ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-1">
            <button
              ref={setDragRef}
              {...listeners}
              {...attributes}
              className="shrink-0 mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
              aria-label="Trascina pasto"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <p className="leading-snug line-clamp-4 text-[13px] cursor-pointer flex-1 hover:text-primary">
                  {desc}
                </p>
              </PopoverTrigger>
              <PopoverContent className="max-w-sm text-sm leading-relaxed">
                <p className="whitespace-pre-wrap">{desc}</p>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Modifica"
            >
              <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
            </button>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 transition ${
              consumed ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Check className="h-3 w-3" />
            {consumed ? "Fatto" : "Segna"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="w-full text-left text-muted-foreground/50 text-xs hover:text-primary py-2"
        >
          + Aggiungi
        </button>
      )}
    </div>
  );
}

function DraggableCellInline({
  id, desc, consumed, onToggle,
}: { id: CellId; desc: string; consumed: boolean; onToggle: () => void }) {
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setDropRef}
      className={`rounded-md transition ${isOver ? "ring-2 ring-primary/50 bg-primary/10" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      {desc ? (
        <div className="flex items-start gap-2">
          <button
            ref={setDragRef}
            {...listeners}
            {...attributes}
            className="shrink-0 mt-1 cursor-grab active:cursor-grabbing touch-none p-1 -ml-1"
            aria-label="Trascina pasto"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex-1 space-y-2 min-w-0">
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{desc}</p>
            <button
              type="button"
              onClick={onToggle}
              className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 transition ${
                consumed ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Check className="h-3 w-3" />
              {consumed ? "Fatto" : "Segna come fatto"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic py-2">Nessun pasto programmato.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Options view (badge allineato accanto al titolo)
// ─────────────────────────────────────────────────────────────────────────────
function OptionsView({ options }: { options: MealOptions }) {
  const sections: Array<{ key: string; title: string; items: string[] }> = [
    { key: "bs", title: "Colazione · opzioni dolci", items: options.breakfast_sweet },
    { key: "bsa", title: "Colazione · opzioni salate", items: options.breakfast_savory },
    { key: "sn", title: "Spuntini", items: options.snacks },
    { key: "fc", title: "Primi piatti", items: options.first_courses },
    { key: "scm", title: "Secondi · carne", items: options.second_courses_meat },
    { key: "scf", title: "Secondi · pesce", items: options.second_courses_fish },
    { key: "sce", title: "Secondi · uova e formaggi", items: options.second_courses_eggs_cheese },
    { key: "si", title: "Contorni", items: options.sides },
    { key: "be", title: "Equivalenze pane (50 g)", items: options.bread_equivalents },
    { key: "ce", title: "Equivalenze cereali", items: options.cereal_equivalents },
    { key: "fr", title: "Frequenze settimanali", items: options.frequencies },
  ];

  return (
    <div className="space-y-3">
      <Accordion type="multiple" className="space-y-2">
        {sections.map((s) =>
          s.items.length > 0 ? (
            <AccordionItem key={s.key} value={s.key} className="rounded-lg border bg-card px-4">
              <AccordionTrigger className="text-sm font-medium hover:no-underline">
                <span className="flex items-center gap-2 flex-1 text-left">
                  <span>{s.title}</span>
                  <Badge variant="secondary" className="shrink-0">{s.items.length}</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 list-disc pl-5 text-sm">
                  {s.items.map((it, i) => <li key={i} className="leading-relaxed whitespace-pre-wrap">{it}</li>)}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ) : null,
        )}
      </Accordion>

      {options.recipes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ricette ({options.recipes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {options.recipes.map((r, i) => (
              <div key={i}>
                {i > 0 && <Separator className="mb-4" />}
                <h3 className="font-medium text-sm mb-2">{r.name}</h3>
                {r.ingredients.length > 0 && (
                  <ul className="text-xs list-disc pl-5 mb-2 text-muted-foreground space-y-0.5">
                    {r.ingredients.map((ing, j) => <li key={j}>{ing}</li>)}
                  </ul>
                )}
                {r.steps && <p className="text-xs leading-relaxed whitespace-pre-line">{r.steps}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GuidelinesView({ guidelines }: { guidelines: GuidelineItem[] }) {
  if (!guidelines.length) {
    return <p className="text-sm text-muted-foreground">Nessuna indicazione generale estratta dal documento.</p>;
  }
  return (
    <div className="space-y-2">
      {guidelines.map((g, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{g.topic}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{g.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopping
// ─────────────────────────────────────────────────────────────────────────────
function ShoppingView({
  weekStart, onGenerate, onLoad, onSave, onClear,
}: {
  weekStart: string;
  onGenerate: (weekStart: string) => Promise<{ items: ShoppingItem[] }>;
  onLoad: (weekStart: string) => Promise<{ items: ShoppingItem[] | null }>;
  onSave: (weekStart: string, items: ShoppingItem[]) => Promise<{ ok: boolean }>;
  onClear: (weekStart: string) => Promise<{ ok: boolean }>;
}) {
  const [selectedWeekStart, setSelectedWeekStart] = useState(weekStart);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setSelectedWeekStart(weekStart);
  }, [weekStart]);

  useEffect(() => {
    setLoading(true);
    setItems(null);
    onLoad(selectedWeekStart).then((r) => { setItems(r.items); setLoading(false); }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekStart]);

  const grouped = useMemo(() => {
    if (!items) return {};
    const g: Record<string, ShoppingItem[]> = {};
    for (const it of items) {
      if (!g[it.category]) g[it.category] = [];
      g[it.category].push(it);
    }
    return g;
  }, [items]);

  const update = (newItems: ShoppingItem[]) => {
    setItems(newItems);
    onSave(selectedWeekStart, newItems).catch((e) => toast.error((e as Error).message));
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-sm">Lista della spesa</CardTitle>
            <CardDescription className="truncate">
              Settimana del {new Date(weekStart).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="outline" onClick={onPrev} aria-label="Settimana precedente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={onNext} aria-label="Settimana successiva">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={items ? "outline" : "default"}
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              try {
                const r = await onGenerate();
                setItems(r.items);
                toast.success("Lista generata dal piano settimanale");
              } catch (e) { toast.error((e as Error).message); }
              finally { setGenerating(false); }
            }}
          >
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {items ? "Rigenera dalla settimana" : "Genera dal piano"}
          </Button>
          {items && items.length > 0 && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmClear(true)}>
              <Eraser className="mr-2 h-4 w-4" /> Svuota lista
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !items || items.length === 0}
            onClick={() => printShoppingList({ weekStart, items: items! })}
          >
            <Printer className="mr-2 h-4 w-4" /> Stampa
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna lista per questa settimana. Genera la lista dal piano alimentare.
          </p>
        ) : (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</h3>
                <ul className="space-y-1.5">
                  {list.map((it, i) => {
                    const globalIdx = items.indexOf(it);
                    return (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={it.checked}
                          onCheckedChange={(c) => {
                            const next = [...items];
                            next[globalIdx] = { ...it, checked: !!c };
                            update(next);
                          }}
                        />
                        <span className={`flex-1 ${it.checked ? "line-through text-muted-foreground" : ""}`}>{it.name}</span>
                        {it.quantity && <Badge variant="outline" className="text-[10px] shrink-0">{it.quantity}</Badge>}
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                          onClick={() => update(items.filter((_, k) => k !== globalIdx))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <AddItemForm onAdd={(name) => update([...items, { name, quantity: null, category: "Altro", checked: false }])} />
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Svuotare la lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutti gli articoli della settimana verranno rimossi. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await onClear();
                  setItems(null);
                  toast.success("Lista svuotata.");
                } catch (e) { toast.error((e as Error).message); }
              }}
            >Svuota</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AddItemForm({ onAdd }: { onAdd: (name: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <form
      className="flex gap-2 pt-2 border-t"
      onSubmit={(e) => {
        e.preventDefault();
        if (val.trim()) { onAdd(val.trim()); setVal(""); }
      }}
    >
      <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Aggiungi voce…" className="h-8" />
      <Button type="submit" size="sm" variant="outline">Aggiungi</Button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset full diet data (with explicit type-to-confirm)
// ─────────────────────────────────────────────────────────────────────────────
function ResetDietDialog({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const can = confirmText === "ELIMINA";

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setConfirmText(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Cancellare tutti i dati Dieta?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Verranno eliminati definitivamente: piani alimentari, schema settimanale, log dei pasti,
            liste della spesa e i documenti caricati per la dieta. L'azione non è reversibile.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <p className="text-sm">Per confermare, scrivi <strong>ELIMINA</strong> qui sotto:</p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ELIMINA" autoFocus />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={!can || busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm();
                setConfirmText("");
                onOpenChange(false);
              } catch (err) { toast.error((err as Error).message); }
              finally { setBusy(false); }
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Cancella tutto
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
