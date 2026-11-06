"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  House,
  Landmark,
  Plus,
  Settings,
  Ticket,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

const LEFT_ITEMS = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/bets", label: "Apuestas", icon: Ticket },
  { href: "/analysis", label: "Consenso", icon: BarChart3 },
] as const;

const RIGHT_ITEMS = [
  { href: "/debts", label: "Deudas", icon: Landmark, debts: true },
  { href: "/bankroll", label: "Bankroll", icon: Wallet },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type BottomNavProps = {
  showDebts?: boolean;
};

export function BottomNav({ showDebts = true }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-7 items-center">
        {LEFT_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(pathname, item.href)}
          />
        ))}

        <div className="flex justify-center">
          <Link
            href="/bets/new"
            aria-label="Registrar nueva apuesta"
            className="-mt-7 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.4} aria-hidden />
          </Link>
        </div>

        {RIGHT_ITEMS.map((item) =>
          "debts" in item && item.debts && !showDebts ? (
            <span key={item.href} aria-hidden />
          ) : (
            <NavItem
              key={item.href}
              {...item}
              active={isActive(pathname, item.href)}
            />
          ),
        )}
      </div>
    </nav>
  );
}

type NavItemProps = {
  href: string;
  label: string;
  icon: typeof House;
  active: boolean;
};

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon
        className="size-[21px]"
        strokeWidth={active ? 2.4 : 1.9}
        aria-hidden
      />
      <span className="w-full truncate text-center">{label}</span>
    </Link>
  );
}
