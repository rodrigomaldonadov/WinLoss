import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 pb-5 md:pb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-40 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight break-words md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm break-words text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
          {action}
        </div>
      )}
    </header>
  );
}
