import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "loss";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
};

const toneClasses: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  loss: "text-loss",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon className="size-4 text-muted-foreground/70" aria-hidden />
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
          toneClasses[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
