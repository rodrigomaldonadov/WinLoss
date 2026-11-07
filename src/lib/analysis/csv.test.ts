import { describe, expect, it } from "vitest";

import {
  decodeCsvBuffer,
  parseCsv,
  parseCsvDate,
  parseCsvDateTime,
  parseSeasonStart,
} from "./csv";

describe("parseCsv", () => {
  it("lee comillas, comas y CRLF", () => {
    const table = parseCsv(
      'Div,HomeTeam,AwayTeam\r\nE0,"Paris Saint-Germain",Niza\r\nE0,"A, B",C\r\n',
    );
    expect(table.headers).toEqual(["Div", "HomeTeam", "AwayTeam"]);
    expect(table.rows).toEqual([
      ["E0", "Paris Saint-Germain", "Niza"],
      ["E0", "A, B", "C"],
    ]);
  });

  it("soporta punto y coma y columnas vacías finales", () => {
    const table = parseCsv("A;B;C;\n1;2;3;;\n", ";");
    expect(table.delimiter).toBe(";");
    expect(table.headers).toEqual(["A", "B", "C", ""]);
    expect(table.rows[0]).toEqual(["1", "2", "3", ""]);
  });

  it("detecta UTF-8 con BOM y Windows-1252", () => {
    const utf8 = Buffer.from("\uFEFFEquipo,Köln\n", "utf8");
    expect(decodeCsvBuffer(utf8).encoding).toBe("UTF-8+BOM");
    expect(decodeCsvBuffer(utf8).text).toContain("Köln");

    const latin = Buffer.from([0x45, 0x71, 0x2c, 0x4b, 0xf6, 0x6c, 0x6e]);
    expect(decodeCsvBuffer(latin).encoding).toBe("Windows-1252");
    expect(decodeCsvBuffer(latin).text).toBe("Eq,Köln");
  });
});

describe("fechas y temporadas", () => {
  it("parsea dd/mm/yy y dd/mm/yyyy a mediodía UTC", () => {
    expect(parseCsvDate("15/08/25")?.toISOString()).toBe(
      "2025-08-15T12:00:00.000Z",
    );
    expect(parseCsvDate("15/08/2025")?.toISOString()).toBe(
      "2025-08-15T12:00:00.000Z",
    );
  });

  it("convierte hora de Londres a UTC", () => {
    expect(
      parseCsvDateTime("15/08/2026", "20:00")?.toISOString(),
    ).toBe("2026-08-15T19:00:00.000Z");
    expect(
      parseCsvDateTime("15/01/2026", "20:00")?.toISOString(),
    ).toBe("2026-01-15T20:00:00.000Z");
  });

  it("infiere el inicio de temporada europea o anual", () => {
    const august = new Date("2025-08-15T12:00:00.000Z");
    const january = new Date("2026-01-15T12:00:00.000Z");
    expect(parseSeasonStart("2024/2025", august)).toBe(2024);
    expect(parseSeasonStart("2024", august)).toBe(2024);
    expect(parseSeasonStart(null, august)).toBe(2025);
    expect(parseSeasonStart(null, january)).toBe(2025);
  });
});
