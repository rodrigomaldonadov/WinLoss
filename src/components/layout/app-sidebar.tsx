"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Plus, Settings, Ticket, Wallet } from "lucide-react";

import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import type { ShellUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/bets", label: "Apuestas", icon: Ticket },
  { href: "/bankroll", label: "Bankroll", icon: Wallet },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppSidebarProps = {
  user: ShellUser;
};

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-sidebar px-3 py-4 md:flex">
      <div className="px-2 pb-8">
        <Brand />
      </div>

      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-2">
        <Button asChild className="h-11 w-full justify-start gap-2 text-sm">
          <Link href="/bets/new">
            <Plus className="size-4" aria-hidden />
            Nueva apuesta
          </Link>
        </Button>
        <UserMenu name={user.name} email={user.email} />
      </div>
    </aside>
  );
}
