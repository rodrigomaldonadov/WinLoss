import Link from "next/link";
import { BarChart3, User } from "lucide-react";

import { Brand } from "@/components/brand";
import { getInitials } from "@/lib/format";
import type { ShellUser } from "@/lib/types";

type AppHeaderProps = {
  user: ShellUser;
};

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <Link
          href="/analysis"
          aria-label="Consenso de picks"
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
        >
          <BarChart3 className="size-5" aria-hidden />
        </Link>
        <Link
          href="/settings"
          aria-label="Ajustes de la cuenta"
          className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors active:bg-primary/20"
        >
          {user.name || user.email ? (
            getInitials(user.name, user.email)
          ) : (
            <User className="size-5" aria-hidden />
          )}
        </Link>
      </div>
    </header>
  );
}
