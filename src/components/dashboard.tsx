import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Upload, Target, Activity, Droplets, FileText, Trash2, Download, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadDialog } from "@/components/upload-dialog";
import { StatusBadge } from "@/components/status-badge";
import { InsightCard } from "@/components/insight-card";
import {
  getDashboardData,
  updateTargetWeight,
  deleteVisit,
  getDocumentUrl,
  hardResetAllData,
  processExtraction,
  getExtractionStatus,
} from "@/lib/dashboard.functions";
import { HardResetDialog } from "@/components/hard-reset-dialog";
import {
  formatNumber,
  formatDate,
  daysBetween,
  bmiLabel,
  visceralFatLabel,
  fatMassLabel,
  hydrationLabel,
  whtRLabel,
  evaluateBlood,
  BLOOD_MARKERS,
  buildWeightInsight,
  buildBloodInsight,
  buildBodyCompInsight,
  buildCircInsight,
} from "@/lib/insights";
import type { VisitFull, BloodTest, DocumentRow, ExtractionStatus } from "@/lib/types";

export function Dashboard() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const qc = useQueryClient();
  const getData = useServerFn(getDashboardData);
  const updTarget = useServerFn(updateTargetWeight);
  const delVisit = useServerFn(deleteVisit);
  const getDocUrl = useServerFn(getDocumentUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getData(),
  });

  const visits: VisitFull[] = useMemo(() => {
    if (!data) return [];
    return data.visits.map((v) => ({
      ...v,
      circumferences: data.circumferences.find((c) => c.visit_id === v.id) ?? null,
      body_composition: data.body_composition.find((b) => b.visit_id === v.id) ?? null,
      dexa_segments: data.dexa_segments.filter((d) => d.visit_id === v.id) as never,
    })) as VisitFull[];
  }, [data]);

  const profile = data?.profile;
  const bloodTests: BloodTest[] = (data?.blood_tests ?? []) as BloodTest[];
  const documents = data?.documents ?? [];

  const lastVisit = visits[visits.length - 1] ?? null;
  const prevVisit = visits[visits.length - 2] ?? null;
  const firstVisit = visits[0] ?? null;

  const weightSeries = visits
    .filter((v) => v.weight_kg != null)
    .map((v) => ({ date: v.visit_date, peso: Number(v.weight_kg) }));

  const weightInsight = buildWeightInsight(weightSeries.map((p) => ({ visit_date: p.date, weight_kg: p.peso })));
  const bcInsights = buildBodyCompInsight(lastVisit, prevVisit, profile?.age ?? null);
  const circInsight = buildCircInsight(lastVisit?.circumferences ?? null, profile?.height_cm ?? null);

  const latestBlood = bloodTests[bloodTests.length - 1] ?? null;
  const prevBlood = bloodTests[bloodTests.length - 2] ?? null;
  const bloodInsights = latestBlood
    ? buildBloodInsight(latestBlood as never, prevBlood as never)
    : [];

  const targetWeight = profile?.target_weight_kg ?? null;
  const currentWeight = lastVisit?.weight_kg != null ? Number(lastVisit.weight_kg) : null;
  const startWeight = firstVisit?.weight_kg != null ? Number(firstVisit.weight_kg) : null;
  const remaining = currentWeight != null && targetWeight != null ? currentWeight - targetWeight : null;
  const totalToLose = startWeight != null && targetWeight != null ? startWeight - targetWeight : null;
  const lostSoFar = startWeight != null && currentWeight != null ? startWeight - currentWeight : null;
  const progressPct = totalToLose && lostSoFar != null && totalToLose > 0
    ? Math.max(0, Math.min(100, (lostSoFar / totalToLose) * 100))
    : 0;

  const daysSinceLast = lastVisit ? daysBetween(lastVisit.visit_date, new Date()) : null;

  const targetMut = useMutation({
    mutationFn: (kg: number | null) => updTarget({ data: { target_weight_kg: kg } }),
    onSuccess: () => {
      toast.success("Obiettivo aggiornato");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (visitId: string) => delVisit({ data: { visitId } }),
    onSuccess: () => {
      toast.success("Visita eliminata");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const downloadDoc = async (documentId: string) => {
    try {
      const { url } = await getDocUrl({ data: { documentId } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carico la dashboard…</div>;
  }

  const bmi = lastVisit?.body_composition?.bmi ? Number(lastVisit.body_composition.bmi) : null;
  const bmiEv = bmiLabel(bmi);
  const fatPct = lastVisit?.body_composition?.fat_mass_pct != null ? Number(lastVisit.body_composition.fat_mass_pct) : null;
  const visceral = lastVisit?.body_composition?.visceral_fat != null ? Number(lastVisit.body_composition.visceral_fat) : null;
  const hydration = lastVisit?.body_composition?.hydration_pct != null ? Number(lastVisit.body_composition.hydration_pct) : null;

  const waist = lastVisit?.circumferences?.waist_cm != null ? Number(lastVisit.circumferences.waist_cm) : null;
  const wht = waist && profile?.height_cm ? waist / Number(profile.height_cm) : null;

  return (
    <div className="min-h-screen bg-[image:var(--gradient-soft)]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none">Il mio percorso</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{profile?.full_name ?? "Profilo"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setUploadOpen(true)} className="rounded-full shadow-[var(--shadow-soft)]">
              <Upload className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Carica referto</span>
              <span className="sm:hidden">Carica</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {visits.length === 0 ? (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        ) : (
          <>
            {/* HEADER RIEPILOGATIVO + OBIETTIVO */}
            <Card className="overflow-hidden border-0 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
              <CardContent className="p-6 sm:p-8">
                <div className="grid gap-6 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Peso attuale</p>
                    <p className="mt-1 text-4xl font-bold tabular-nums">{formatNumber(currentWeight, 1)}<span className="text-lg font-normal opacity-80"> kg</span></p>
                    {prevVisit?.weight_kg != null && currentWeight != null && (
                      <p className="text-sm opacity-90 mt-1">
                        {(currentWeight - Number(prevVisit.weight_kg)) >= 0 ? "+" : ""}
                        {formatNumber(currentWeight - Number(prevVisit.weight_kg), 1)} kg dall'ultima visita
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Obiettivo</p>
                    {targetWeight != null && remaining != null ? (
                      <>
                        <p className="mt-1 text-4xl font-bold tabular-nums">
                          {remaining > 0 ? "-" : "+"}{formatNumber(Math.abs(remaining), 1)}<span className="text-lg font-normal opacity-80"> kg</span>
                        </p>
                        <p className="text-sm opacity-90 mt-1">al traguardo di {formatNumber(targetWeight, 1)} kg</p>
                      </>
                    ) : (
                      <TargetEditor onSave={(kg) => targetMut.mutate(kg)} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Ultima visita</p>
                    <p className="mt-1 text-4xl font-bold tabular-nums">{daysSinceLast ?? 0}<span className="text-lg font-normal opacity-80"> g fa</span></p>
                    <p className="text-sm opacity-90 mt-1">{formatDate(lastVisit?.visit_date)}</p>
                  </div>
                </div>
                {targetWeight != null && totalToLose != null && totalToLose > 0 && (
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-xs opacity-90">
                      <span>{formatNumber(lostSoFar ?? 0, 1)} kg persi</span>
                      <span>{Math.round(progressPct)}%</span>
                    </div>
                    <Progress value={progressPct} className="h-2 bg-primary-foreground/20" />
                    <button
                      onClick={() => {
                        const v = prompt("Nuovo peso obiettivo (kg)", targetWeight ? String(targetWeight) : "");
                        if (v != null && v !== "") targetMut.mutate(Number(v));
                      }}
                      className="text-xs underline opacity-80 hover:opacity-100"
                    >
                      Modifica obiettivo
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* INSIGHT GLOBALE */}
            {weightInsight && <InsightCard insight={weightInsight} />}

            <Tabs defaultValue="weight" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
                <TabsTrigger value="weight">Peso & BMI</TabsTrigger>
                <TabsTrigger value="composition">Composizione</TabsTrigger>
                <TabsTrigger value="circ">Circonferenze</TabsTrigger>
                <TabsTrigger value="blood">Esami</TabsTrigger>
                <TabsTrigger value="history">Storico</TabsTrigger>
              </TabsList>

              {/* PESO & BMI */}
              <TabsContent value="weight" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <KpiCard title="Peso attuale" value={`${formatNumber(currentWeight, 1)} kg`} sub={startWeight != null && currentWeight != null ? `${(currentWeight - startWeight >= 0 ? "+" : "")}${formatNumber(currentWeight - startWeight, 1)} kg dall'inizio` : ""} />
                  <KpiCard title="BMI" value={formatNumber(bmi, 1)} badge={<StatusBadge status={bmiEv.status}>{bmiEv.label}</StatusBadge>} />
                  <KpiCard title="Visite registrate" value={String(visits.length)} sub={firstVisit ? `dal ${formatDate(firstVisit.visit_date)}` : ""} />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Andamento del peso</CardTitle>
                    <CardDescription>Tutte le pesate in ordine cronologico</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartLine data={weightSeries} dataKey="peso" unit="kg" />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* COMPOSIZIONE */}
              <TabsContent value="composition" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiCard title="Massa grassa" value={`${formatNumber(fatPct, 1)} %`} badge={<StatusBadge status={fatMassLabel(fatPct).status}>{fatMassLabel(fatPct).label}</StatusBadge>} />
                  <KpiCard title="Massa magra" value={`${formatNumber(lastVisit?.body_composition?.lean_mass_kg != null ? Number(lastVisit.body_composition.lean_mass_kg) : null, 1)} kg`} />
                  <KpiCard title="Grasso viscerale" value={formatNumber(visceral, 1)} badge={<StatusBadge status={visceralFatLabel(visceral).status}>{visceralFatLabel(visceral).label}</StatusBadge>} />
                  <KpiCard title="Idratazione" value={`${formatNumber(hydration, 1)} %`} badge={<StatusBadge status={hydrationLabel(hydration).status}>{hydrationLabel(hydration).label}</StatusBadge>} icon={<Droplets className="h-4 w-4" />} />
                </div>
                {bcInsights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Massa grassa %</CardTitle></CardHeader>
                    <CardContent>
                      <ChartLine data={visits.filter(v => v.body_composition?.fat_mass_pct != null).map(v => ({ date: v.visit_date, val: Number(v.body_composition!.fat_mass_pct) }))} dataKey="val" unit="%" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Massa magra kg</CardTitle></CardHeader>
                    <CardContent>
                      <ChartLine data={visits.filter(v => v.body_composition?.lean_mass_kg != null).map(v => ({ date: v.visit_date, val: Number(v.body_composition!.lean_mass_kg) }))} dataKey="val" unit="kg" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Grasso viscerale</CardTitle></CardHeader>
                    <CardContent>
                      <ChartLine data={visits.filter(v => v.body_composition?.visceral_fat != null).map(v => ({ date: v.visit_date, val: Number(v.body_composition!.visceral_fat) }))} dataKey="val" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Età metabolica</CardTitle></CardHeader>
                    <CardContent>
                      <ChartLine data={visits.filter(v => v.body_composition?.metabolic_age != null).map(v => ({ date: v.visit_date, val: Number(v.body_composition!.metabolic_age) }))} dataKey="val" unit="anni" />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* CIRCONFERENZE */}
              <TabsContent value="circ" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <KpiCard title="Vita" value={`${formatNumber(waist, 1)} cm`} />
                  <KpiCard title="Addome" value={`${formatNumber(lastVisit?.circumferences?.abdomen_cm != null ? Number(lastVisit.circumferences.abdomen_cm) : null, 1)} cm`} />
                  <KpiCard title="Vita / altezza" value={formatNumber(wht, 2)} badge={<StatusBadge status={whtRLabel(wht).status}>{whtRLabel(wht).label}</StatusBadge>} />
                </div>
                {circInsight && <InsightCard insight={circInsight} />}
                <Card>
                  <CardHeader>
                    <CardTitle>Andamento circonferenze</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CircChart visits={visits} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ESAMI */}
              <TabsContent value="blood" className="space-y-4">
                {bloodInsights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(BLOOD_MARKERS).map(([key, m]) => {
                    const series = bloodTests
                      .filter((t) => (t as never as Record<string, unknown>)[key] != null)
                      .map((t) => ({ date: t.test_date, val: Number((t as never as Record<string, number>)[key]) }));
                    if (series.length === 0) return null;
                    const last = series[series.length - 1].val;
                    const ev = evaluateBlood(key, last);
                    return (
                      <Card key={key}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
                              <p className="text-2xl font-bold mt-1 tabular-nums">{formatNumber(last, 1)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
                            </div>
                            <StatusBadge status={ev.status}>{ev.label}</StatusBadge>
                          </div>
                          <p className="text-xs text-muted-foreground">Range: {m.min ? `${m.min}-${m.max}` : `≤ ${m.max}`} {m.unit}</p>
                        </CardHeader>
                        <CardContent>
                          <ChartLine data={series} dataKey="val" height={120} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {/* STORICO */}
              <TabsContent value="history" className="space-y-3">
                {[...visits].reverse().map((v) => {
                  const doc = documents.find((d) => d.id === v.document_id);
                  return (
                    <Card key={v.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <p className="font-semibold">{formatDate(v.visit_date)}</p>
                          <p className="text-sm text-muted-foreground">
                            Peso: <span className="font-medium text-foreground tabular-nums">{formatNumber(v.weight_kg != null ? Number(v.weight_kg) : null, 1)} kg</span>
                            {v.body_composition?.fat_mass_pct != null && <> · Grasso: <span className="font-medium text-foreground">{formatNumber(Number(v.body_composition.fat_mass_pct), 1)}%</span></>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc && (
                            <Button variant="outline" size="sm" onClick={() => downloadDoc(doc.id)}>
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                              Referto
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Eliminare questa visita? Anche il file verrà cancellato.")) {
                                deleteMut.mutate(v.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            </Tabs>

            {/* Documenti caricati con stato estrazione */}
            <DocumentsPanel documents={documents as DocumentRow[]} />

            {/* Zona pericolosa */}
            <DangerZone />
          </>
        )}
      </main>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

const STATUS_META: Record<ExtractionStatus, { label: string; tone: string; icon: React.ReactNode }> = {
  pending: { label: "In attesa", tone: "bg-muted text-muted-foreground border-border", icon: <FileText className="h-3.5 w-3.5" /> },
  processing: { label: "Elaborazione…", tone: "bg-primary/10 text-primary border-primary/30", icon: <Activity className="h-3.5 w-3.5 animate-pulse" /> },
  extracted: { label: "Estratto · da confermare", tone: "bg-warning/20 text-warning-foreground border-warning/40", icon: <FileText className="h-3.5 w-3.5" /> },
  confirmed: { label: "Confermato", tone: "bg-success/15 text-success border-success/30", icon: <FileText className="h-3.5 w-3.5" /> },
  failed: { label: "Errore", tone: "bg-destructive/15 text-destructive border-destructive/30", icon: <FileText className="h-3.5 w-3.5" /> },
};

// Stima asintotica: 1 - exp(-t/τ), cap al 95% finché lo stato non passa a extracted.
// τ ≈ 25s → a 25s ~63%, a 45s ~83%, a 60s ~91%.
const EXTRACTION_TAU_MS = 25_000;
function estimateProgress(elapsedMs: number): number {
  const raw = 1 - Math.exp(-Math.max(0, elapsedMs) / EXTRACTION_TAU_MS);
  return Math.min(0.95, raw);
}

function DocumentsPanel({ documents }: { documents: DocumentRow[] }) {
  const qc = useQueryClient();
  const getDocUrl = useServerFn(getDocumentUrl);
  const processFn = useServerFn(processExtraction);
  const statusFn = useServerFn(getExtractionStatus);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const hasActive = documents.some(
    (d) => d.extraction_status === "processing" || (retryingId === d.id && d.extraction_status === "pending"),
  );

  // Tick ogni secondo solo se c'è almeno un'estrazione in corso
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActive]);

  // Polling automatico della dashboard ogni 5s mentre c'è processing
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    }, 5000);
    return () => clearInterval(t);
  }, [hasActive, qc]);

  if (documents.length === 0) return null;

  const handleDownload = async (id: string) => {
    try {
      const { url } = await getDocUrl({ data: { documentId: id } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      processFn({ data: { documentId: id } }).catch(() => {});
      toast.info("Estrazione riavviata.");
      const start = Date.now();
      const tick = async () => {
        const { status } = await statusFn({ data: { documentId: id } });
        if (status === "extracted" || status === "confirmed" || status === "failed") {
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          setRetryingId((cur) => (cur === id ? null : cur));
          if (status === "failed") toast.error("Estrazione fallita di nuovo.");
          else toast.success("Estrazione completata.");
          return;
        }
        if (Date.now() - start > 3 * 60 * 1000) {
          setRetryingId((cur) => (cur === id ? null : cur));
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          return;
        }
        setTimeout(tick, 3000);
      };
      setTimeout(tick, 2000);
    } catch (e) {
      toast.error((e as Error).message);
      setRetryingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Documenti caricati
        </CardTitle>
        <CardDescription>Stato di estrazione per ogni referto inviato.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.map((d) => {
          const meta = STATUS_META[d.extraction_status];
          const isRetrying = retryingId === d.id;
          const isActive = d.extraction_status === "processing" || (isRetrying && d.extraction_status === "pending");
          const elapsedMs = isActive ? Math.max(0, now - new Date(d.uploaded_at).getTime()) : 0;
          const pct = isActive ? Math.round(estimateProgress(elapsedMs) * 100) : 0;
          const elapsedSec = Math.round(elapsedMs / 1000);

          return (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate max-w-[260px] sm:max-w-none">{d.original_name}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.tone}`}
                  >
                    {meta.icon}
                    {isActive ? "Elaborazione…" : meta.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Caricato il {formatDate(d.uploaded_at)}
                </p>

                {isActive && (
                  <div className="mt-2 space-y-1">
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>~{pct}%</span>
                      <span>{elapsedSec}s trascorsi</span>
                    </div>
                  </div>
                )}

                {d.extraction_status === "failed" && d.extraction_error && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {d.extraction_error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDownload(d.id)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  File
                </Button>
                {(d.extraction_status === "failed" || d.extraction_status === "pending") && (
                  <Button
                    size="sm"
                    onClick={() => handleRetry(d.id)}
                    disabled={isRetrying}
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                    Riprova
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}


function DangerZone() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const resetFn = useServerFn(hardResetAllData);
  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { confirm: "RESET" } }),
    onSuccess: () => {
      toast.success("Tutti i dati sono stati cancellati.");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-base text-destructive flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Zona pericolosa
        </CardTitle>
        <CardDescription>
          Cancella definitivamente tutte le visite, gli esami, i file caricati e i dati anagrafici.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" /> Cancella tutti i dati
        </Button>
      </CardContent>
      <HardResetDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => resetMut.mutate()}
        loading={resetMut.isPending}
      />
    </Card>
  );
}

// ───── Helpers UI ─────

function KpiCard({ title, value, sub, badge, icon }: { title: string; value: string; sub?: string; badge?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">{icon}{title}</p>
          {badge}
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ChartLine({ data, dataKey, unit, height = 220 }: { data: { date: string; [k: string]: string | number }[]; dataKey: string; unit?: string; height?: number }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} stroke="var(--color-muted-foreground)" />
        <YAxis fontSize={11} stroke="var(--color-muted-foreground)" domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)" }}
          labelFormatter={(v) => formatDate(v as string)}
          formatter={(val: number) => [`${formatNumber(val, 2)}${unit ? " " + unit : ""}`, ""]}
        />
        <Line type="monotone" dataKey={dataKey} stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--color-primary)" }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CircChart({ visits }: { visits: VisitFull[] }) {
  const data = visits
    .filter((v) => v.circumferences)
    .map((v) => ({
      date: v.visit_date,
      vita: v.circumferences?.waist_cm != null ? Number(v.circumferences.waist_cm) : null,
      addome: v.circumferences?.abdomen_cm != null ? Number(v.circumferences.abdomen_cm) : null,
      braccio: v.circumferences?.arm_cm != null ? Number(v.circumferences.arm_cm) : null,
    }));
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nessuna circonferenza registrata.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} fontSize={11} stroke="var(--color-muted-foreground)" />
        <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
        <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} labelFormatter={(v) => formatDate(v as string)} />
        <Legend />
        <Line type="monotone" dataKey="vita" stroke="var(--color-chart-1)" strokeWidth={2} />
        <Line type="monotone" dataKey="addome" stroke="var(--color-chart-3)" strokeWidth={2} />
        <Line type="monotone" dataKey="braccio" stroke="var(--color-chart-2)" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TargetEditor({ onSave }: { onSave: (kg: number | null) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="mt-2 flex items-center gap-2">
      <Input
        type="number"
        step="0.1"
        placeholder="es. 80"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-9 max-w-24 bg-primary-foreground/15 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/60"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => val && onSave(Number(val))}
      >
        <Target className="mr-1 h-3.5 w-3.5" />
        Imposta
      </Button>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground">
          <FileText className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Inizia caricando il primo referto</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Carica il file .doc che ti consegna la dietologa. L'AI estrarrà tutti i dati automaticamente
            e tu dovrai solo confermarli.
          </p>
        </div>
        <Button onClick={onUpload} size="lg" className="rounded-full shadow-[var(--shadow-soft)]">
          <Upload className="mr-2 h-4 w-4" />
          Carica primo referto
        </Button>
      </CardContent>
    </Card>
  );
}
