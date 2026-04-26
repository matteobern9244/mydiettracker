import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Dashboard } from "@/components/dashboard";

// Schema dei filtri della dashboard, persistiti negli URL search params.
// - tab: sezione attiva delle Tabs
// - {sez}From / {sez}To: range date custom per ogni sezione (ISO yyyy-mm-dd)
// - {sez}Preset: preset rapido ("3m" | "6m" | "1y" | "all" | "custom")
// - {sez}Metrics: lista di metriche visibili (toggle multipli)
const dashboardSearchSchema = z.object({
  tab: fallback(z.enum(["weight", "composition", "circ", "blood", "history"]), "weight").default("weight"),

  weightPreset: fallback(z.enum(["3m", "6m", "1y", "all", "custom"]), "all").default("all"),
  weightFrom: fallback(z.string().optional(), undefined),
  weightTo: fallback(z.string().optional(), undefined),

  compPreset: fallback(z.enum(["3m", "6m", "1y", "all", "custom"]), "all").default("all"),
  compFrom: fallback(z.string().optional(), undefined),
  compTo: fallback(z.string().optional(), undefined),
  compMetrics: fallback(z.array(z.enum(["fat_pct", "lean_kg", "visceral", "metabolic_age"])), [
    "fat_pct",
    "lean_kg",
    "visceral",
    "metabolic_age",
  ]).default(["fat_pct", "lean_kg", "visceral", "metabolic_age"]),

  circPreset: fallback(z.enum(["3m", "6m", "1y", "all", "custom"]), "all").default("all"),
  circFrom: fallback(z.string().optional(), undefined),
  circTo: fallback(z.string().optional(), undefined),

  bloodPreset: fallback(z.enum(["3m", "6m", "1y", "all", "custom"]), "all").default("all"),
  bloodFrom: fallback(z.string().optional(), undefined),
  bloodTo: fallback(z.string().optional(), undefined),
  bloodMetrics: fallback(
    z.array(
      z.enum([
        "total_cholesterol",
        "ldl",
        "hdl",
        "triglycerides",
        "glucose",
        "ast",
        "alt",
        "gamma_gt",
        "hemoglobin",
      ]),
    ),
    [],
  ).default([]),
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: zodValidator(dashboardSearchSchema),
  component: Dashboard,
});
