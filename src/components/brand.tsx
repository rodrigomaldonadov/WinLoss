import Link from "next/link";
import { TrendingUp } from "lucide-react";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

type BrandProps = {
  href?: string;
  className?: string;
  compact?: boolean;
};

export function Brand({ href = "/", className, compact = false }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-lg py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={`${APP_NAME} — inicio`}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <TrendingUp className="size-5" strokeWidth={2.5} aria-hidden />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
      )}
    </Link>
  );
}
