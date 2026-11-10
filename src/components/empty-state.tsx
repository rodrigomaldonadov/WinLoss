import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs ring-1 ring-border">
        <Icon className="size-6" strokeWidth={1.8} aria-hidden />
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-balance text-muted-foreground">
        {description}
      </p>
      {action && (
        <div className="mt-5 max-w-full [&_a]:h-auto [&_a]:min-h-11 [&_a]:whitespace-normal [&_a]:text-center [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal">
          {action}
        </div>
      )}
    </div>
  );
}

