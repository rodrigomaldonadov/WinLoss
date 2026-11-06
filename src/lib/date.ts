import { DEFAULT_TIMEZONE } from "@/lib/constants";

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
