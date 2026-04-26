import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type DatePreset = "3m" | "6m" | "1y" | "all" | "custom";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "3m", label: "3 mesi" },
  { value: "6m", label: "6 mesi" },
  { value: "1y", label: "1 anno" },
  { value: "all", label: "Tutto" },
];

export type MetricOption<T extends string = string> = {
  value: T;
  label: string;
};

type SectionFilterProps<T extends string = string> = {
  preset: DatePreset;
  from?: string;
  to?: string;
  onPresetChange: (preset: DatePreset, from?: string, to?: string) => void;
  metrics?: MetricOption<T>[];
  selectedMetrics?: T[];
  onMetricsChange?: (next: T[]) => void;
  className?: string;
};

export function SectionFilter<T extends string = string>({
  preset,
  from,
  to,
  onPresetChange,
  metrics,
  selectedMetrics,
  onMetricsChange,
  className,
}: SectionFilterProps<T>) {
  const [open, setOpen] = useState(false);
  const fromDate = from ? parseISO(from) : undefined;
  const toDate = to ? parseISO(to) : undefined;

  const isCustomActive = preset === "custom" && (from || to);
  const customLabel = isCustomActive
    ? `${fromDate ? format(fromDate, "d MMM yy", { locale: it }) : "…"} → ${toDate ? format(toDate, "d MMM yy", { locale: it }) : "…"}`
    : "Personalizzato";

  const hasMetricFilter =
    metrics && selectedMetrics && metrics.length !== selectedMetrics.length;

  const reset = () => {
    onPresetChange("all", undefined, undefined);
    if (metrics && onMetricsChange) onMetricsChange(metrics.map((m) => m.value));
  };

  const hasAnyFilter = preset !== "all" || hasMetricFilter;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/40 p-2",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 pl-1 pr-1 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Filtri</span>
      </div>

      {/* Preset rapidi */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            type="button"
            size="sm"
            variant={preset === p.value ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => onPresetChange(p.value, undefined, undefined)}
          >
            {p.label}
          </Button>
        ))}

        {/* Range custom */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={isCustomActive ? "default" : "outline"}
              className="h-7 rounded-full px-3 text-xs"
            >
              <CalendarIcon className="mr-1 h-3 w-3" />
              {customLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-2">
              <Label className="text-xs">Da</Label>
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={(d) =>
                  onPresetChange(
                    "custom",
                    d ? format(d, "yyyy-MM-dd") : undefined,
                    to,
                  )
                }
                initialFocus
                locale={it}
                className={cn("p-0 pointer-events-auto")}
              />
              <Label className="text-xs">A</Label>
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={(d) =>
                  onPresetChange(
                    "custom",
                    from,
                    d ? format(d, "yyyy-MM-dd") : undefined,
                  )
                }
                locale={it}
                className={cn("p-0 pointer-events-auto")}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Toggle metriche */}
      {metrics && metrics.length > 0 && selectedMetrics && onMetricsChange && (
        <>
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={hasMetricFilter ? "default" : "outline"}
                className="h-7 rounded-full px-3 text-xs"
              >
                Metriche ({selectedMetrics.length}/{metrics.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {metrics.map((m) => {
                  const checked = selectedMetrics.includes(m.value);
                  return (
                    <label
                      key={m.value}
                      className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = v
                            ? Array.from(new Set([...selectedMetrics, m.value]))
                            : selectedMetrics.filter((x) => x !== m.value);
                          onMetricsChange(next);
                        }}
                      />
                      <span className="text-sm">{m.label}</span>
                    </label>
                  );
                })}
                <div className="flex justify-between pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => onMetricsChange(metrics.map((m) => m.value))}
                  >
                    Tutte
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => onMetricsChange([])}
                  >
                    Nessuna
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}

      {hasAnyFilter && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 rounded-full px-2 text-xs text-muted-foreground"
          onClick={reset}
        >
          <X className="mr-1 h-3 w-3" />
          Azzera
        </Button>
      )}
      {/* Avoid unused state warning if popovers stay closed externally */}
      {open ? null : null}
      <span className="hidden">{String(open)}</span>
    </div>
  );
}

/**
 * Calcola la data minima inclusiva in base al preset.
 * Restituisce undefined se il preset è "all" o "custom" (in custom usa from/to).
 */
export function presetToFromDate(preset: DatePreset, now = new Date()): Date | undefined {
  if (preset === "all" || preset === "custom") return undefined;
  const d = new Date(now);
  if (preset === "3m") d.setMonth(d.getMonth() - 3);
  else if (preset === "6m") d.setMonth(d.getMonth() - 6);
  else if (preset === "1y") d.setFullYear(d.getFullYear() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Filtra una lista di item che hanno un campo `date` (string ISO yyyy-mm-dd
 * o ISO datetime) in base ai filtri di sezione.
 */
export function filterByDate<T extends { date?: string; visit_date?: string; test_date?: string }>(
  items: T[],
  preset: DatePreset,
  from?: string,
  to?: string,
): T[] {
  let minDate: Date | undefined;
  let maxDate: Date | undefined;

  if (preset === "custom") {
    minDate = from ? parseISO(from) : undefined;
    maxDate = to ? parseISO(to) : undefined;
  } else {
    minDate = presetToFromDate(preset);
  }

  if (!minDate && !maxDate) return items;

  return items.filter((it) => {
    const raw = it.date ?? it.visit_date ?? it.test_date;
    if (!raw) return true;
    const d = typeof raw === "string" ? parseISO(raw) : new Date(raw);
    if (isNaN(d.getTime())) return true;
    if (minDate && d < minDate) return false;
    if (maxDate) {
      const end = new Date(maxDate);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  });
}
