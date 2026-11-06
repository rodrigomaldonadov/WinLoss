"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { BetListItem } from "@/lib/data/bets";

type SportsPieChartProps = {
  bets: BetListItem[];
  height?: number;
};

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function SportsPieChart({ bets, height = 260 }: SportsPieChartProps) {
  // Distribución por número de apuestas (no por beneficio: un pie no representa negativos).
  const counts = new Map<string, number>();
  for (const bet of bets) {
    const key = bet.sport?.trim() || "Sin deporte";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const data = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Registra apuestas para ver la distribución por deporte.
      </p>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={`Distribución de ${total} apuestas por deporte`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="45%"
            outerRadius="72%"
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((item, index) => (
              <Cell
                key={item.name}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            formatter={(value) => [
              `${Number(value)} apuesta${Number(value) === 1 ? "" : "s"}`,
              "Total",
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(value: string) => (
              <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
