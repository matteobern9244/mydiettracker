import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, Upload, ArrowLeft, ChevronLeft, ChevronRight, BookOpen, ListChecks,
  ShoppingCart, CalendarDays, Loader2, Trash2, Check, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { withAuth } from "@/lib/server-call";
import {
  getActiveDietPlan, toggleMealLog, generateShoppingList, getShoppingList,
  updateShoppingList, deleteActiveDietPlan, MEAL_SLOTS, type MealSlot, type MealOptions,
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
    meta: [{ title: "Dieta · Il mio percorso" }, { name: "description", content: "Piano alimentare in stile calendario." }],
  }),
});

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Colazione",
  mid_morning: "Spuntino mattina",
  lunch: "Pranzo",
  afternoon: "Spuntino pomeriggio",
  dinner: "Cena",
};
const DAY_LABEL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAY_LABEL_LONG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date): Date {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // 0=Mon
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}
function getDow(d: Date): number {
  // 1=Mon..7=Sun
  return ((d.getDay() + 6) % 7) + 1;
}

function DietPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isMobile = useIsMobile();
  const view = search.view ?? (isMobile ? "day" : "week");
  const tab = search.tab;
  const today = useMemo(() => new Date(), []);
  const currentDate = search.date ? new Date(search.date) : today;
  const weekStart = startOfWeek(currentDate);

  const [uploadOpen, setUploadOpen] = useState(false);
  const qc = useQueryClient();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const getPlanFn = withAuth(useServerFn(getActiveDietPlan));
  const toggleLogFn = withAuth(useServerFn(toggleMealLog));
  const genShopFn = withAuth(useServerFn(generateShoppingList));
  const getShopFn = withAuth(useServerFn(getShoppingList));
  const updShopFn = withAuth(useServerFn(updateShoppingList));
  const delPlanFn = withAuth(useServerFn(deleteActiveDietPlan));

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

  // Mappa per accesso rapido: scheduleMap[dow][slot]
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

  const setView = (v: "week" | "day") => navigate({ search: (s) => ({ ...s, view: v }) });
  const setTab = (t: typeof tab) => navigate({ search: (s) => ({ ...s, tab: t }) });
  const setDate = (d: Date) => navigate({ search: (s) => ({ ...s, date: isoDate(d) }) });

  // Aderenza settimanale
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
                  opzioni pasto e indicazioni generali. Potrai vederli in stile calendario.
                </p>
              </div>
              <Button onClick={() => setUploadOpen(true)} size="lg" className="rounded-full">
                <Upload className="mr-2 h-4 w-4" />
                Carica piano alimentare
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
              <TabsTrigger value="calendar"><CalendarDays className="mr-1 h-4 w-4" />Calendario</TabsTrigger>
              <TabsTrigger value="options"><ListChecks className="mr-1 h-4 w-4" />Opzioni</TabsTrigger>
              <TabsTrigger value="guidelines"><BookOpen className="mr-1 h-4 w-4" />Indicazioni</TabsTrigger>
              <TabsTrigger value="shopping"><ShoppingCart className="mr-1 h-4 w-4" />Spesa</TabsTrigger>
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
                  <Button size="sm" variant="outline" onClick={() => setDate(today)}>
                    Oggi
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => setDate(addDays(currentDate, view === "week" ? 7 : 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {view === "week" ? (
                <WeekGrid
                  weekStart={weekStart}
                  today={today}
                  scheduleMap={scheduleMap}
                  logsMap={logsMap}
                  onToggle={(date, slot, consumed) => toggleMut.mutate({ logDate: date, mealSlot: slot, consumed })}
                />
              ) : (
                <DayView
                  date={currentDate}
                  scheduleMap={scheduleMap}
                  logsMap={logsMap}
                  onToggle={(date, slot, consumed) => toggleMut.mutate({ logDate: date, mealSlot: slot, consumed })}
                  options={plan.meal_options}
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
                onGenerate={() => genShopFn({ data: { weekStart: isoDate(weekStart) } })}
                onLoad={() => getShopFn({ data: { weekStart: isoDate(weekStart) } })}
                onSave={(items) => updShopFn({ data: { weekStart: isoDate(weekStart), items } })}
                onPrev={() => setDate(addDays(weekStart, -7))}
                onNext={() => setDate(addDays(weekStart, 7))}
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
            <CardContent>
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
            </CardContent>
          </Card>
        )}
      </main>

      <UploadDietDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Week grid
// ─────────────────────────────────────────────────────────────────────────────
function WeekGrid({
  weekStart, today, scheduleMap, logsMap, onToggle,
}: {
  weekStart: Date;
  today: Date;
  scheduleMap: Record<number, Partial<Record<MealSlot, string>>>;
  logsMap: Record<string, Partial<Record<MealSlot, boolean>>>;
  onToggle: (date: string, slot: MealSlot, consumed: boolean) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = isoDate(today);

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[120px_repeat(7,minmax(0,1fr))] border-b bg-muted/30">
            <div className="p-2 text-xs font-semibold text-muted-foreground">Pasto</div>
            {days.map((d, i) => {
              const isToday = isoDate(d) === todayStr;
              return (
                <div
                  key={i}
                  className={`p-2 text-center text-xs font-semibold ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  <div>{DAY_LABEL[i]}</div>
                  <div className="text-[10px] opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
                </div>
              );
            })}
          </div>
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="grid grid-cols-[120px_repeat(7,minmax(0,1fr))] border-b">
              <div className="p-2 text-xs font-medium bg-muted/20">{SLOT_LABEL[slot]}</div>
              {days.map((d, i) => {
                const dow = i + 1;
                const desc = scheduleMap[dow]?.[slot] ?? "";
                const dateStr = isoDate(d);
                const consumed = !!logsMap[dateStr]?.[slot];
                const isToday = dateStr === todayStr;
                return (
                  <div key={i} className={`p-2 text-xs border-l ${isToday ? "bg-primary/5" : ""}`}>
                    {desc ? (
                      <div className="space-y-1.5">
                        <p className="leading-snug line-clamp-3">{desc}</p>
                        <button
                          type="button"
                          onClick={() => onToggle(dateStr, slot, !consumed)}
                          className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 transition ${
                            consumed
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          <Check className="h-3 w-3" />
                          {consumed ? "Fatto" : "Segna"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Day view
// ─────────────────────────────────────────────────────────────────────────────
function DayView({
  date, scheduleMap, logsMap, onToggle, options,
}: {
  date: Date;
  scheduleMap: Record<number, Partial<Record<MealSlot, string>>>;
  logsMap: Record<string, Partial<Record<MealSlot, boolean>>>;
  onToggle: (date: string, slot: MealSlot, consumed: boolean) => void;
  options: MealOptions;
}) {
  const dow = getDow(date);
  const dateStr = isoDate(date);

  const altOptions: Record<MealSlot, string[]> = {
    breakfast: [...options.breakfast_sweet, ...options.breakfast_savory],
    mid_morning: options.snacks,
    lunch: [...options.first_courses, ...options.second_courses_meat, ...options.second_courses_fish],
    afternoon: options.snacks,
    dinner: [...options.second_courses_fish, ...options.second_courses_eggs_cheese],
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-xl font-semibold">{DAY_LABEL_LONG[dow - 1]}</h2>
        <p className="text-sm text-muted-foreground">{date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      {MEAL_SLOTS.map((slot) => {
        const desc = scheduleMap[dow]?.[slot] ?? "";
        const consumed = !!logsMap[dateStr]?.[slot];
        const alts = altOptions[slot].filter((o) => o && o !== desc).slice(0, 6);
        return (
          <Card key={slot}>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-semibold">{SLOT_LABEL[slot]}</CardTitle>
              </div>
              <Checkbox
                checked={consumed}
                onCheckedChange={(c) => onToggle(dateStr, slot, !!c)}
                aria-label="Pasto consumato"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              {desc ? (
                <p className="text-sm leading-relaxed">{desc}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nessun pasto programmato per questo slot.</p>
              )}
              {alts.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Alternative ({alts.length})
                  </summary>
                  <ul className="mt-2 space-y-1 list-disc pl-4 text-muted-foreground">
                    {alts.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Options view
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
              <AccordionTrigger className="text-sm font-medium">
                {s.title} <Badge variant="secondary" className="ml-2">{s.items.length}</Badge>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 list-disc pl-5 text-sm">
                  {s.items.map((it, i) => <li key={i} className="leading-relaxed">{it}</li>)}
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

// ─────────────────────────────────────────────────────────────────────────────
// Guidelines view
// ─────────────────────────────────────────────────────────────────────────────
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
            <p className="text-sm leading-relaxed text-muted-foreground">{g.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopping list view
// ─────────────────────────────────────────────────────────────────────────────
function ShoppingView({
  weekStart, onGenerate, onLoad, onSave, onPrev, onNext,
}: {
  weekStart: string;
  onGenerate: () => Promise<{ items: ShoppingItem[] }>;
  onLoad: () => Promise<{ items: ShoppingItem[] | null }>;
  onSave: (items: ShoppingItem[]) => Promise<{ ok: boolean }>;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    onLoad().then((r) => { setItems(r.items); setLoading(false); }).catch(() => setLoading(false));
  }, [weekStart]);

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
    onSave(newItems).catch((e) => toast.error((e as Error).message));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm">Lista della spesa</CardTitle>
          <CardDescription>
            Settimana del {new Date(weekStart).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={onPrev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={onNext}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna lista per questa settimana. Genera la lista dal piano alimentare.
          </p>
        ) : (
          <div className="space-y-4">
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
                        <span className={it.checked ? "line-through text-muted-foreground" : ""}>{it.name}</span>
                        {it.quantity && <Badge variant="outline" className="ml-auto text-[10px]">{it.quantity}</Badge>}
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6"
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
