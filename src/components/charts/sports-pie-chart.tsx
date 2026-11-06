"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { BetListItem } from "@/lib/data/bets";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";

type SportsPieChartProps = {
  bets: BetListItem[];
  width?: number;
  height?: number;
};

export function SportsPieChart({
  bets,
  width = 500,
  height = 300,
}: SportsPieChartProps) {
  // Agrupar ganancias por deporte
  const bySport = bets.reduce<
    Array<{ name: string; total: number }>
  >((acc, bet) => {
    const profit = bet.profit ?? 0;
    if (profit === 0) return acc;
    const existing = acc.find((item) => item.name === bet.sport);
    if (existing) {
      existing.total += profit;
    } else {
      acc.push({ name: bet.sport, total: profit });
    }
    return acc;
  }, [] as Array<{ name: string; total: number }>);

  const total = bySport.reduce(
    (sum, item) => sum + Math.abs(item.total),
    0
  );

  return (
    <ResponsiveContainer width={width} height={height}>
      <PieChart data={bySport} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
        <Tooltip labelFormatter={(value) => `$${value}`} formatter={(value) => `$${value}`} />
        <Legend verticalAlign="top" height={160} />
        <Pie dataKey="total" nameKey="name">
          {bySport.map((item, index) => (
            <Cell key={item.name} fill={["#8884d8", "#82cafc", "#fad09c", "#f5cba7"][index % 4]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}