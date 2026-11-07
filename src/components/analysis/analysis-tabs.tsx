import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "upcoming", href: "/analysis", label: "Próximos" },
  { key: "history", href: "/analysis/historial", label: "Historial" },
  { key: "precision", href: "/analysis/precision", label: "Precisión" },
] as const;

export type AnalysisTabKey = (typeof TABS)[number]["key"];

export function AnalysisTabs({ active }: { active: AnalysisTabKey }) {
  return (
    <nav
      aria-label="Secciones de análisis"
      className="grid grid-cols-3 gap-1 rounded-xl bg-muted/50 p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground active:bg-background/60",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
