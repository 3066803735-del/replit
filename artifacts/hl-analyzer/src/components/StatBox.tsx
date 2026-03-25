import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatBoxProps {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  className?: string;
  trend?: "up" | "down" | "neutral";
  highlight?: boolean;
}

export function StatBox({ label, value, subtext, className, highlight }: StatBoxProps) {
  return (
    <div className={cn("flex flex-col p-4 rounded-lg bg-background border border-panel-border/50", highlight && "border-primary/50 shadow-[0_0_15px_rgba(51,210,255,0.1)]", className)}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</span>
      <div className="text-xl font-mono font-semibold tracking-tight text-foreground flex items-baseline gap-2">
        {value}
      </div>
      {subtext && (
        <div className="mt-2 text-xs font-mono text-muted-foreground">
          {subtext}
        </div>
      )}
    </div>
  );
}
