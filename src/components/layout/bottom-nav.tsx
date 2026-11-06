"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Settings, Ticket, Wallet } from "lucide-react";

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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        {items.slice(0, 2).map((item) => (
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
            className="-mt-7 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <span className="text-2xl leading-none" aria-hidden>
              +
            </span>
          </Link>
        </div>

        {items.slice(2).map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(pathname, item.href)}
          />
        ))}
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
        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon
        className="size-[22px]"
        strokeWidth={active ? 2.4 : 1.9}
        aria-hidden
      />
      <span>{label}</span>
    </Link>
  );
}
