import { describe, expect, it } from "vitest";

import { parseBetText } from "./bet-text-parser";

const NOW = new Date(2026, 10, 6, 12, 0, 0);

const MULTIPLE_SLIP = `Múltiple x9
S/ 5.00
Cuota 10.21

LASK Linz vs Liverpool, Feyenoord vs Como, Real Betis vs FC Porto, Shakhtar Donetsk vs AEK Atenas, Slovan Bratislava vs VfB Stuttgart, FK Bodo Glimt vs Borussia Dortmund, AS Roma vs Real Madrid, Aston Villa vs Fenerbahce, Manchester City vs París Saint Germain
Liverpool
1.34
Resultado del partido (1X2)
14/10 • 11:45
LASK Linz
3
Liverpool
6
Más de 1.5
1.12
Total de goles
14/10 • 11:45
Feyenoord
3
Como
2
Más de 1.5
1.22
Total de goles
14/10 • 14:00
Real Betis
3
FC Porto
2
Más de 1.5
1.27
Total de goles
14/10 • 14:00
Shakhtar Donetsk
3
AEK Atenas
1
Más de 2.5
1.33
Total de goles
14/10 • 14:00
Slovan Bratislava
0
VfB Stuttgart
3
Más de 2.5
1.36
Total de goles
14/10 • 14:00
FK Bodo Glimt
1
Borussia Dortmund
0
Total de goles
Más de 1.5
Doble Oportunidad
Empate o Real Madrid
Crear Apuesta
1.46
14/10 • 14:00
AS Roma
Real Madrid
Más de 1.5
1.18
Total de goles
14/10 • 14:00
Aston Villa
6
Fenerbahce
0
Total de goles
Más de 1.5
Ambos equipos anotan
Sí
Crear Apuesta
1.41
14/10 • 14:00
Manchester City
París Saint Germain
Cuota total
10.21
Apuesta total
PEN 5.00
Ganancia total
PEN 0.00`;

const SIMPLE_SLIP = `Simple
S/ 100.00
Cuota 1.32

Galatasaray vs Barcelona
Barcelona
1.32
Resultado del partido (1X2)
13/10 • 14:00
Galatasaray
1
Barcelona
4
Cuota total
1.32
Apuesta total
PEN 100.00
Ganancia total
PEN 132.00`;

describe("parseBetText · múltiple de Apuesta Total", () => {
  const parsed = parseBetText(MULTIPLE_SLIP, { now: NOW });

  it("detecta cabecera, stake y cuota total", () => {
    expect(parsed.betType).toBe("COMBINED");
    expect(parsed.stake).toBe(5);
    expect(parsed.totalOdds).toBe(10.21);
    expect(parsed.legs).toHaveLength(9);
    expect(parsed.warnings).toEqual([]);
  });

  it("lee la primera selección 1X2 con fecha y cuota", () => {
    const leg = parsed.legs[0];
    expect(leg?.eventName).toBe("LASK Linz vs Liverpool");
    expect(leg?.eventDate).toBe("2026-10-14T11:45");
    expect(leg?.odds).toBe(1.34);
    expect(leg?.isBuilder).toBe(false);
    expect(leg?.selections).toHaveLength(1);
    expect(leg?.selections[0]).toMatchObject({
      marketKey: "MATCH_RESULT",
      selection: "Liverpool",
      pick: "AWAY",
      line: null,
    });
  });

  it("lee goles con línea en varios partidos", () => {
    expect(parsed.legs[1]?.selections[0]).toMatchObject({
      marketKey: "TOTAL_GOALS",
      line: 1.5,
      pick: "OVER",
      selection: "Más de 1.5",
    });
    expect(parsed.legs[4]?.selections[0]).toMatchObject({
      marketKey: "TOTAL_GOALS",
      line: 2.5,
      pick: "OVER",
    });
    expect(parsed.legs[7]?.odds).toBe(1.18);
  });

  it("convierte legs con dos selecciones en builder", () => {
    const builder = parsed.legs[6];
    expect(builder?.eventName).toBe("AS Roma vs Real Madrid");
    expect(builder?.isBuilder).toBe(true);
    expect(builder?.odds).toBe(1.46);
    expect(builder?.selections).toHaveLength(2);
    expect(builder?.selections[0]).toMatchObject({
      marketKey: "TOTAL_GOALS",
      line: 1.5,
      pick: "OVER",
    });
    expect(builder?.selections[1]).toMatchObject({
      marketKey: "DOUBLE_CHANCE",
      pick: "DRAW_AWAY",
      selection: "Empate o Real Madrid",
    });

    const last = parsed.legs[8];
    expect(last?.eventName).toBe("Manchester City vs París Saint Germain");
    expect(last?.isBuilder).toBe(true);
    expect(last?.selections).toHaveLength(2);
    expect(last?.selections[1]).toMatchObject({
      marketKey: "BTTS",
      pick: "YES",
      selection: "Sí",
    });
  });

  it("no confunde los marcadores con selecciones", () => {
    const text = parsed.legs
      .flatMap((leg) => leg.selections.map((selection) => selection.selection))
      .join(" ");
    expect(text).not.toContain("LASK Linz 3");
    expect(text).not.toMatch(/^3$/);
    expect(parsed.legs[2]?.eventName).toBe("Real Betis vs FC Porto");
  });
});

describe("parseBetText · simple de Apuesta Total", () => {
  const parsed = parseBetText(SIMPLE_SLIP, { now: NOW });

  it("detecta un boleto simple", () => {
    expect(parsed.betType).toBe("SINGLE");
    expect(parsed.stake).toBe(100);
    expect(parsed.totalOdds).toBe(1.32);
    expect(parsed.legs).toHaveLength(1);
    expect(parsed.warnings).toEqual([]);
  });

  it("lee equipo, mercado, cuota y fecha", () => {
    const leg = parsed.legs[0];
    expect(leg?.eventName).toBe("Galatasaray vs Barcelona");
    expect(leg?.eventDate).toBe("2026-10-13T14:00");
    expect(leg?.odds).toBe(1.32);
    expect(leg?.isBuilder).toBe(false);
    expect(leg?.selections[0]).toMatchObject({
      marketKey: "MATCH_RESULT",
      selection: "Barcelona",
      pick: "AWAY",
    });
  });
});

describe("parseBetText · ganancia aumentada", () => {
  const parsed = parseBetText(
    `Múltiple x3
S/ 50.00
Cuota 5.58

SC Corinthians Paulista vs Mirassol, Racing Club Avellaneda vs CA Aldosivi, CA Sarmiento vs Rosario Central
SC Corinthians Paulista
1.83
Resultado del partido (1X2)
30/10 • 18:00
SC Corinthians Paulista
2
Mirassol
0
Racing Club Avellaneda
1.66
Resultado del partido (1X2)
30/10 • 19:15
Racing Club Avellaneda
2
CA Aldosivi
1
Rosario Central
1.84
Resultado del partido (1X2)
30/10 • 19:15
CA Sarmiento
1
Rosario Central
2
Cuota total
5.58
Apuesta total
PEN 50.00
Ganancias aumentadas
+5%
Ganancia total
PEN 279.48
PEN 293.45`,
    { now: NOW },
  );

  it("detecta el porcentaje de ganancia aumentada", () => {
    expect(parsed.betType).toBe("COMBINED");
    expect(parsed.stake).toBe(50);
    expect(parsed.totalOdds).toBe(5.58);
    expect(parsed.oddsBoostPct).toBe(5);
    expect(parsed.legs).toHaveLength(3);
    expect(parsed.warnings).toEqual([]);
  });

  it("conserva los tres 1X2 y sus fechas", () => {
    expect(parsed.legs[0]).toMatchObject({
      eventName: "SC Corinthians Paulista vs Mirassol",
      eventDate: "2026-10-30T18:00",
      odds: 1.83,
    });
    expect(parsed.legs[0]?.selections[0]).toMatchObject({
      marketKey: "MATCH_RESULT",
      pick: "HOME",
    });
    expect(parsed.legs[2]).toMatchObject({
      eventName: "CA Sarmiento vs Rosario Central",
      eventDate: "2026-10-30T19:15",
      odds: 1.84,
    });
    expect(parsed.legs[2]?.selections[0]).toMatchObject({
      marketKey: "MATCH_RESULT",
      pick: "AWAY",
    });
  });

  it("no confunde la ganancia aumentada con otros porcentajes", () => {
    const withoutBoost = parseBetText(SIMPLE_SLIP, { now: NOW });
    expect(withoutBoost.oddsBoostPct).toBeNull();
  });
});

describe("parseBetText · casos límite", () => {
  it("devuelve un resultado vacío con aviso si no hay texto", () => {
    const parsed = parseBetText("   ", { now: NOW });
    expect(parsed.legs).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("acepta importes con coma decimal", () => {
    const parsed = parseBetText(
      `Simple
S/ 10,50
Cuota 1,80

Equipo A vs Equipo B
Equipo A
1,80
Resultado del partido (1X2)
01/01 • 20:00`,
      { now: NOW },
    );
    expect(parsed.stake).toBe(10.5);
    expect(parsed.totalOdds).toBe(1.8);
    expect(parsed.legs[0]?.odds).toBe(1.8);
  });

  it("infiere un año anterior si la fecha quedaría muy en el futuro", () => {
    const parsed = parseBetText(
      `Simple
S/ 10
Cuota 2.00

Equipo A vs Equipo B
Equipo A
2.00
Resultado del partido (1X2)
20/02 • 20:00`,
      { now: NOW },
    );
    expect(parsed.legs[0]?.eventDate).toBe("2026-02-20T20:00");
  });

  it("respeta el año cuando el boleto lo incluye", () => {
    const parsed = parseBetText(
      `Simple
S/ 10
Cuota 2.00

Equipo A vs Equipo B
Equipo A
2.00
Resultado del partido (1X2)
14/10/2025 • 11:45`,
      { now: NOW },
    );
    expect(parsed.legs[0]?.eventDate).toBe("2025-10-14T11:45");
  });
});
