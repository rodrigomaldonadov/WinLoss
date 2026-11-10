"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BankrollHistoryPoint } from "@/lib/data/bankrolls";
import { formatCurrency, formatDate } from "@/lib/format";

type BankrollLineChartProps = {
  bankrolls: BankrollHistoryPoint[];
  currency?: string;
  timeZone?: string;
  height?: number;
};

const EVENT_SERIES = [
  { key: "deposit", label: "Depósitos", color: "var(--chart-3)" },
  { key: "loan", label: "Préstamos", color: "var(--chart-5)" },
  { key: "payment", label: "Pagos", color: "var(--chart-4)" },
  { key: "withdrawal", label: "Retiros", color: "var(--chart-2)" },
] as const;

export function BankrollLineChart({
  bankrolls,
  currency = "PEN",
  timeZone,
  height = 260,
}: BankrollLineChartProps) {
  const data = bankrolls.map((entry) => ({
    day: entry.date,
    bankroll: entry.bankroll,
    deposit: entry.deposit ?? null,
    loan: entry.loan ?? null,
    payment: entry.payment ?? null,
    withdrawal: entry.withdrawal ?? null,
  }));

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aún no hay historial de bankroll para graficar.
      </p>
    );
  }

  return (
    <div className="w-full">
      <div
        style={{ height }}
        role="img"
        aria-label="Evolución del bankroll con depósitos, préstamos y pagos"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="bankroll-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) =>
                formatDate(value, timeZone ? { timeZone } : undefined)
              }
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              width={56}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat("es-PE", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(value)
              }
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              labelFormatter={(value) =>
                formatDate(String(value), timeZone ? { timeZone } : undefined)
              }
              formatter={(value) => [
                formatCurrency(Number(value), currency),
                "Bankroll",
              ]}
            />
            <Area
              type="monotone"
              dataKey="bankroll"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#bankroll-fill)"
              activeDot={{ r: 4 }}
            />
            {EVENT_SERIES.map((series) => (
              <Scatter
                key={series.key}
                dataKey={series.key}
                fill={series.color}
                stroke="var(--background)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-[var(--chart-1)]" />
          Bankroll
        </span>
        {EVENT_SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
