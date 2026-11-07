"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestHistoryTeamsAction } from "@/lib/actions/analysis";
import { historyHref, type HistoryFilterState } from "@/lib/analysis/history";
import { cn } from "@/lib/utils";

type TeamSuggestion = { id: string; name: string };

const DEBOUNCE_MS = 250;

/**
 * Campo de equipo con sugerencias del servidor. Los alias y los acentos se
 * resuelven en `searchAnalysisTeams`; aquí solo se elige el nombre canónico.
 * Enter sin sugerencia activa envía el formulario, así el buscador funciona
 * aunque el autocompletado falle.
 */
export function HistoryTeamSearch({
  filters,
}: {
  filters: HistoryFilterState;
}) {
  const router = useRouter();
  const listId = useId();
  const sequence = useRef(0);
  const [query, setQuery] = useState(filters.query);
  const [teams, setTeams] = useState<TeamSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const id = sequence.current + 1;
    sequence.current = id;
    if (trimmed.length < 2) return;

    const timer = window.setTimeout(async () => {
      if (sequence.current === id) setLoading(true);
      try {
        const result = await suggestHistoryTeamsAction({ query: trimmed });
        if (sequence.current !== id) return;
        if (result.ok) {
          setTeams(result.teams);
          setActive(-1);
          setOpen(true);
          setError(null);
        } else {
          setTeams([]);
          setError(result.error);
        }
      } catch {
        if (sequence.current === id) {
          setTeams([]);
          setError("No pudimos buscar equipos ahora.");
        }
      } finally {
        if (sequence.current === id) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  const choose = (team: TeamSuggestion) => {
    setQuery(team.name);
    setOpen(false);
    setActive(-1);
    router.push(historyHref({ ...filters, query: team.name, page: 1 }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (teams.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % teams.length);
      return;
    }
    if (event.key === "ArrowUp") {
      if (teams.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((current) =>
        current <= 0 ? teams.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Enter" && open && active >= 0 && teams[active]) {
      event.preventDefault();
      choose(teams[active]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const showList =
    open &&
    query.trim().length >= 2 &&
    (loading || Boolean(error) || teams.length > 0);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        name="q"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (teams.length > 0) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
        placeholder="Buscar equipo: Real Madrid, Man Utd…"
        aria-label="Buscar por equipo"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          active >= 0 && teams[active] ? `${listId}-${active}` : undefined
        }
        enterKeyHint="search"
        autoComplete="off"
        className="h-10 pr-11 pl-9 text-sm"
      />
      {loading && (
        <Loader2
          className="pointer-events-none absolute top-1/2 right-10 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
      <Button
        type="submit"
        size="icon-xs"
        variant="ghost"
        className="absolute top-1/2 right-1 -translate-y-1/2"
        aria-label="Buscar"
      >
        <ArrowRight className="size-4" aria-hidden />
      </Button>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugerencias de equipos"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Buscando equipos…
            </li>
          )}
          {!loading && error && (
            <li role="alert" className="px-3 py-2 text-xs text-destructive">
              {error}
            </li>
          )}
          {!loading &&
            !error &&
            teams.map((team, index) => (
              <li
                key={team.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(team)}
                className={cn(
                  "cursor-pointer truncate px-3 py-2 text-sm",
                  index === active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {team.name}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}


