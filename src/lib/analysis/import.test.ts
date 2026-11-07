import { describe, expect, it } from "vitest";

import { parseAnalysisFile, resolveTeamName } from "./import";
import type { TeamAliasesFile } from "./team-names";

const MAIN_HEADER =
  "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HS,AS,HST,AST,HC,AC,HY,AY,HR,AR,AvgH,AvgD,AvgA,AvgCH,AvgCD,AvgCA,Avg>2.5,Avg<2.5,AvgC>2.5,AvgC<2.5";

const MAIN_CSV = `${MAIN_HEADER}
E0,01/08/2021,20:00,Old Team,Other,1,0,H,5,4,2,1,3,2,1,1,0,0,2,3,4,2,3,4,2,1.8,2,1.8
E0,01/08/2022,20:00,Arsenal,Chelsea,2,1,H,10,8,5,4,6,5,2,3,0,0,1.8,3.5,4.2,1.75,3.6,4,2.1,1.7,2,1.8`;

const EXTRA_CSV = `Country,League,Season,Date,Time,Home,Away,HG,AG,Res,AvgCH,AvgCD,AvgCA
Argentina,Liga Profesional,2021,01/08/2021,20:00,Old Team,Other,1,0,H,2,3,4
Argentina,Liga Profesional,2022,01/08/2022,20:00,Boca,River,1,1,D,2.1,3.2,3.4`;

const FIXTURE_CSV = `Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA,Avg>2.5,Avg<2.5
E0,01/01/2099,20:00,Arsenal,Chelsea,1.8,3.5,4.2,2.1,1.7
E0,01/01/2020,20:00,Old Team,Other,2,3,4,2,1.8`;

describe("parseAnalysisFile · históricos", () => {
  it("mapea la liga principal, filtra antigüedad y guarda cuotas/estadísticas", () => {
    const parsed = parseAnalysisFile(
      MAIN_CSV,
      "england/22-23/E0.csv",
      "UTF-8",
    );
    expect(parsed.format).toBe("historical");
    expect(parsed.skippedOld).toBe(1);
    expect(parsed.rows).toHaveLength(1);

    const row = parsed.rows[0]!;
    expect(row.competition.competition).toBe("Premier League");
    expect(row.season).toBe("2022/23");
    expect(row.seasonStart).toBe(2022);
    expect(row.homeName).toBe("Arsenal");
    expect(row.homeGoals).toBe(2);
    expect(row.odds).toMatchObject({
      pre: { home: 1.8, draw: 3.5, away: 4.2, over25: 2.1, under25: 1.7 },
      closing: { home: 1.75, draw: 3.6, away: 4 },
    });
    expect(row.stats).toMatchObject({ shotsHome: 10, cornersAway: 5 });
  });

  it("mapea una extra league anual y usa solo cuotas de cierre", () => {
    const parsed = parseAnalysisFile(
      EXTRA_CSV,
      "argentina/ARG.csv",
      "UTF-8",
    );
    expect(parsed.format).toBe("historical");
    expect(parsed.skippedOld).toBe(1);
    expect(parsed.rows).toHaveLength(1);

    const row = parsed.rows[0]!;
    expect(row.competition.competition).toBe("Liga Profesional");
    expect(row.season).toBe("2022");
    expect(row.seasonStart).toBe(2022);
    expect(row.odds).toMatchObject({
      closing: { home: 2.1, draw: 3.2, away: 3.4 },
    });
    expect(row.odds).not.toHaveProperty("pre");
  });

  it("cuenta duplicados dentro del archivo", () => {
    const duplicated = `${MAIN_HEADER}
E0,01/08/2022,20:00,Arsenal,Chelsea,2,1,H,10,8,5,4,6,5,2,3,0,0,1.8,3.5,4.2,1.75,3.6,4,2.1,1.7,2,1.8
E0,01/08/2022,20:00,Arsenal,Chelsea,2,1,H,10,8,5,4,6,5,2,3,0,0,1.8,3.5,4.2,1.75,3.6,4,2.1,1.7,2,1.8`;
    const parsed = parseAnalysisFile(duplicated, "england/22-23/E0.csv");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.duplicatesInFile).toBe(1);
  });
});

describe("parseAnalysisFile · fixtures", () => {
  it("detecta el formato de próximos partidos y descarta pasados", () => {
    const parsed = parseAnalysisFile(
      FIXTURE_CSV,
      "data-football/fixtures/fixtures.csv",
      "UTF-8",
    );
    expect(parsed.format).toBe("fixtures");
    expect(parsed.fixtures).toHaveLength(1);
    expect(parsed.skippedOld).toBe(1);
    expect(parsed.fixtures[0]?.homeName).toBe("Arsenal");
    expect(parsed.fixtures[0]?.odds).toMatchObject({
      pre: { home: 1.8, draw: 3.5, away: 4.2, over25: 2.1, under25: 1.7 },
    });
  });
});

describe("alias explícitos", () => {
  const aliases: TeamAliasesFile = {
    version: 1,
    teams: {
      barcelona: "Barcelona",
      arsenal: "Arsenal",
      "man united": "Man United",
    },
  };

  it("resuelve por nombre normalizado", () => {
    expect(resolveTeamName("FC Barcelona", aliases)).toBe("Barcelona");
    expect(resolveTeamName("Arsenal", aliases)).toBe("Arsenal");
  });

  it("no inventa un alias si falta", () => {
    expect(resolveTeamName("Equipo Desconocido", aliases)).toBeNull();
  });
});
