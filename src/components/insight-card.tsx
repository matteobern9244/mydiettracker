import { Sparkles, AlertTriangle, Info } from "lucide-react";
import type { Insight } from "@/lib/insights";
import { cn } from "@/lib/utils";

const tones = {
  positive: { wrap: "bg-success/10 border-success/25 text-foreground", icon: "text-success", Icon: Sparkles },
  warn: { wrap: "bg-warning/15 border-warning/30 text-foreground", icon: "text-warning-foreground", Icon: AlertTriangle },
  neutral: { wrap: "bg-muted/60 border-border text-foreground", icon: "text-muted-foreground", Icon: Info },
} as const;

export function InsightCard({ insight, className }: { insight: Insight; className?: string }) {
  const t = tones[insight.tone];
  const Icon = t.Icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-sm", t.wrap, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} />
      <p className="leading-relaxed">{insight.text}</p>
    </div>
  );
}
