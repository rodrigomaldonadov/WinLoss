import { DEFAULT_TIMEZONE } from "@/lib/constants";

/**
 * Convierte un wall-time `YYYY-MM-DDTHH:mm` (fecha/hora tal como la ve el
 * usuario en su zona) al instante UTC correcto.
 */
export function zonedDateTimeToUtc(
  input: string,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(
    input.trim(),
  );
  if (!match) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? "0");
  const minute = Number(match[5] ?? "0");

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Offset de la zona en ese instante (wall time - UTC).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(asUtc));

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const wallAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );

  const offset = wallAsUtc - asUtc;
  return new Date(asUtc - offset);
}


/**
 * Devuelve un valor apto para `<input type="datetime-local">` en la zona
 * horaria indicada. Se calcula en el servidor para evitar desajustes de
 * hidratación entre la hora del servidor y la del navegador.
 */
export function toZonedDateTimeInput(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
