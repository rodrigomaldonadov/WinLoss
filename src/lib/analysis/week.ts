/** Lunes 00:00 UTC de la semana del partido, como `YYYY-MM-DD`. */
export function weekStart(date: Date): string {
  const copy = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
  const day = copy.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy.toISOString().slice(0, 10);
}

export function weekStartDate(date: Date): Date {
  return new Date(`${weekStart(date)}T00:00:00.000Z`);
}
