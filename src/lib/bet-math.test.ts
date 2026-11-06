import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  calculateBetClosingLineValue,
  calculateBetResult,
  effectiveLegOdds,
  settleBet,
  totalOdds,
} from "./bet-math";

describe("totalOdds", () => {
  it("multiplica las cuotas de un múltiple con 3 decimales", () => {
    expect(totalOdds([{ odds: "1.55" }, { odds: "1.44" }]).toFixed(3)).toBe(
      "2.232",
    );
  });

  it("redondea a 3 decimales", () => {
    expect(totalOdds([{ odds: 1.333 }, { odds: 1.333 }]).toFixed(3)).toBe(
      "1.777",
    );
  });
});

describe("effectiveLegOdds", () => {
  it("aplica la regla de cada estado", () => {
    expect(effectiveLegOdds(2, "WON")?.toNumber()).toBe(2);
    expect(effectiveLegOdds(2, "VOID")?.toNumber()).toBe(1);
    expect(effectiveLegOdds(2, "HALF_WON")?.toNumber()).toBe(1.5);
    expect(effectiveLegOdds(2, "HALF_LOST")?.toNumber()).toBe(0.5);
    expect(effectiveLegOdds(2, "LOST")?.toNumber()).toBe(0);
    expect(effectiveLegOdds(2, "PENDING")).toBeNull();
  });
});

describe("settleBet", () => {
  it("liquida un múltiple ganado (1.55 x 1.44, stake 100)", () => {
    const result = settleBet(
      [
        { odds: "1.55", status: "WON" },
        { odds: "1.44", status: "WON" },
      ],
      100,
    );

    expect(result.status).toBe("WON");
    expect(result.effectiveOdds.toFixed(3)).toBe("2.232");
    expect(result.payout.toFixed(2)).toBe("223.20");
    expect(result.profit.toFixed(2)).toBe("123.20");
  });

  it("liquida un Bet Builder ganado con cuota manual 3.00", () => {
    const result = settleBet([{ odds: 3, status: "WON" }], 100);

    expect(result.status).toBe("WON");
    expect(result.payout.toFixed(2)).toBe("300.00");
    expect(result.profit.toFixed(2)).toBe("200.00");
  });

  it("pierde el boleto completo si un leg pierde aunque queden pendientes", () => {
    const result = settleBet(
      [
        { odds: 1.55, status: "WON" },
        { odds: 1.44, status: "LOST" },
        { odds: 2.1, status: "PENDING" },
      ],
      100,
    );

    expect(result.status).toBe("LOST");
    expect(result.payout.toFixed(2)).toBe("0.00");
    expect(result.profit.toFixed(2)).toBe("-100.00");
  });

  it("mantiene el boleto pendiente si no hay derrotas y queda un leg pendiente", () => {
    const result = settleBet(
      [
        { odds: 1.55, status: "WON" },
        { odds: 1.44, status: "PENDING" },
      ],
      100,
    );

    expect(result.status).toBe("PENDING");
    expect(result.payout.toFixed(2)).toBe("0.00");
  });

  it("anula el boleto cuando todos los legs son VOID", () => {
    const result = settleBet(
      [
        { odds: 1.55, status: "VOID" },
        { odds: 1.44, status: "VOID" },
      ],
      100,
    );

    expect(result.status).toBe("VOID");
    expect(result.payout.toFixed(2)).toBe("100.00");
    expect(result.profit.toFixed(2)).toBe("0.00");
  });

  it("un leg VOID no multiplica y el resto sigue ganando", () => {
    const result = settleBet(
      [
        { odds: 2, status: "WON" },
        { odds: 1.5, status: "VOID" },
      ],
      100,
    );

    expect(result.status).toBe("WON");
    expect(result.payout.toFixed(2)).toBe("200.00");
  });

  it("liquida HALF_WON con la cuota efectiva combinada", () => {
    const result = settleBet(
      [
        { odds: 2, status: "HALF_WON" },
        { odds: 2, status: "WON" },
      ],
      100,
    );

    // (2 + 1) / 2 = 1.5, x 2 = 3.0
    expect(result.status).toBe("HALF_WON");
    expect(result.effectiveOdds.toFixed(3)).toBe("3.000");
    expect(result.payout.toFixed(2)).toBe("300.00");
    expect(result.profit.toFixed(2)).toBe("200.00");
  });

  it("liquida HALF_LOST con la cuota efectiva combinada", () => {
    const result = settleBet([{ odds: 2, status: "HALF_LOST" }], 100);

    expect(result.status).toBe("HALF_LOST");
    expect(result.effectiveOdds.toFixed(3)).toBe("0.500");
    expect(result.payout.toFixed(2)).toBe("50.00");
    expect(result.profit.toFixed(2)).toBe("-50.00");
  });

  it("marca VOID si los halves dejan una cuota efectiva de 1", () => {
    const result = settleBet(
      [
        { odds: 3, status: "HALF_WON" },
        { odds: 2, status: "HALF_LOST" },
      ],
      100,
    );

    expect(result.effectiveOdds.toFixed(3)).toBe("1.000");
    expect(result.status).toBe("VOID");
    expect(result.payout.toFixed(2)).toBe("100.00");
  });

  it("no devuelve el stake en una free bet ganada", () => {
    const result = settleBet([{ odds: 3, status: "WON" }], 100, true);

    expect(result.payout.toFixed(2)).toBe("200.00");
    expect(result.profit.toFixed(2)).toBe("200.00");
  });

  it("una free bet perdida no genera pérdida", () => {
    const result = settleBet([{ odds: 3, status: "LOST" }], 100, true);

    expect(result.status).toBe("LOST");
    expect(result.payout.toFixed(2)).toBe("0.00");
    expect(result.profit.toFixed(2)).toBe("0.00");
  });

  it("redondea los importes monetarios a 2 decimales", () => {
    const result = settleBet([{ odds: "1.333", status: "WON" }], "10.00");
    expect(result.payout.toFixed(2)).toBe("13.33");
  });

  it("aplica la ganancia aumentada al retorno si gana", () => {
    const result = settleBet([{ odds: 5.58, status: "WON" }], 50, false, 5);

    expect(result.payout.toFixed(2)).toBe("292.95");
    expect(result.profit.toFixed(2)).toBe("242.95");
  });

  it("aplica la ganancia aumentada a una free bet", () => {
    const result = settleBet([{ odds: 3, status: "WON" }], 100, true, 10);

    expect(result.payout.toFixed(2)).toBe("220.00");
    expect(result.profit.toFixed(2)).toBe("220.00");
  });

  it("no aplica la ganancia aumentada si pierde o queda nula", () => {
    expect(settleBet([{ odds: 2, status: "LOST" }], 50, false, 5).profit.toFixed(2)).toBe(
      "-50.00",
    );
    expect(settleBet([{ odds: 2, status: "VOID" }], 50, false, 5).payout.toFixed(2)).toBe(
      "50.00",
    );
  });
});

describe("calculateBetResult con ganancia aumentada", () => {
  it("aumenta el retorno de una apuesta ganada", () => {
    const result = calculateBetResult({
      stake: 100,
      odds: 2,
      status: "WON",
      oddsBoostPct: 10,
    });

    expect(result.payout.toFixed(2)).toBe("220.00");
    expect(result.profit.toFixed(2)).toBe("120.00");
  });

  it("no afecta a una apuesta perdida", () => {
    const result = calculateBetResult({
      stake: 100,
      odds: 2,
      status: "LOST",
      oddsBoostPct: 10,
    });

    expect(result.payout.toFixed(2)).toBe("0.00");
    expect(result.profit.toFixed(2)).toBe("-100.00");
  });
});

describe("calculateBetClosingLineValue", () => {
  it("multiplica el CLV de los legs con cuota de cierre", () => {
    const clv = calculateBetClosingLineValue([
      { odds: 2, closingOdds: 1.8 },
      { odds: 1.5, closingOdds: 1.6 },
    ]);

    expect(clv).not.toBeNull();
    // (2/1.8) * (1.5/1.6) - 1 = 0.041666...
    expect(clv?.percentage.toFixed(2)).toBe("4.17");
  });

  it("omite los legs sin cuota de cierre", () => {
    const clv = calculateBetClosingLineValue([
      { odds: 2, closingOdds: 1.8 },
      { odds: 3, closingOdds: null },
    ]);

    expect(clv).not.toBeNull();
    expect(clv?.value.toFixed(4)).toBe("0.1111");
  });

  it("devuelve null cuando ningún leg tiene cuota de cierre", () => {
    expect(
      calculateBetClosingLineValue([
        { odds: 2, closingOdds: null },
        { odds: 3 },
      ]),
    ).toBeNull();
  });

  it("acepta Decimal como cuota", () => {
    const clv = calculateBetClosingLineValue([
      { odds: new Decimal("2.00"), closingOdds: new Decimal("1.90") },
    ]);

    expect(clv?.percentage.toFixed(2)).toBe("5.26");
  });
});
