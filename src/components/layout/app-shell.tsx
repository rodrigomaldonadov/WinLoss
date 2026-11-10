import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import type { ShellUser } from "@/lib/types";

type AppShellProps = {
  user: ShellUser;
  showDebts?: boolean;
  children: ReactNode;
};

export function AppShell({ user, showDebts = true, children }: AppShellProps) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>

      <AppSidebar user={user} showDebts={showDebts} />

      <div className="flex min-h-dvh flex-col md:pl-64">
        <AppHeader user={user} />
        <main
          id="contenido"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8"
        >
          {children}
        </main>
      </div>

      <BottomNav showDebts={showDebts} />
    </div>
  );
}

