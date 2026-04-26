import type { StatusLevel } from "@/lib/insights";
import { cn } from "@/lib/utils";

const tones: Record<StatusLevel, string> = {
  good: "bg-success/15 text-success border border-success/30",
  warn: "bg-warning/20 text-warning-foreground border border-warning/40",
  bad: "bg-destructive/15 text-destructive border border-destructive/30",
  neutral: "bg-muted text-muted-foreground border border-border",
};

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: StatusLevel;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[status],
        className,
      )}
    >
      {children}
    </span>
  );
}
