import type { ReactNode } from "react";
import { BarChart3, ShieldCheck, Smartphone } from "lucide-react";

import { Brand } from "@/components/brand";

const benefits = [
  {
    icon: BarChart3,
    title: "Métricas reales",
    description: "ROI, yield y win rate calculados automáticamente.",
  },
  {
    icon: ShieldCheck,
    title: "Bankroll bajo control",
    description: "Separa tu capital y evita apostar de más.",
  },
  {
    icon: Smartphone,
    title: "Pensado para el móvil",
    description: "Registra un pick en segundos, estés donde estés.",
  },
] as const;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15">
            <BarChart3 className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">WinLoss</span>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="max-w-sm text-3xl font-semibold tracking-tight text-balance">
              Convierte tus apuestas en decisiones.
            </h2>
            <p className="max-w-sm text-sm text-primary-foreground/80">
              Deja de adivinar si vas ganando. WinLoss mide tu rentabilidad real
              apuesta a apuesta.
            </p>
          </div>

          <ul className="space-y-5">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <li key={benefit.title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{benefit.title}</p>
                    <p className="text-xs text-primary-foreground/75">
                      {benefit.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/60">
          Juego responsable · +18 · Los datos son tuyos.
        </p>
      </aside>

      <div className="flex flex-1 flex-col bg-background">
        <header className="flex justify-center px-4 pt-8 lg:hidden">
          <Brand />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="px-4 pb-8 text-center text-xs text-muted-foreground lg:hidden">
          Juego responsable · +18
        </footer>
      </div>
    </div>
  );
}
