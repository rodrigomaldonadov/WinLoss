"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency, formatDate } from "@/lib/format";

type BankrollLineChartProps = {
  bankrolls: { date: string; bankroll: number }[];
  currency?: string;
  timeZone?: string;
  height?: number;
};

export function BankrollLineChart({
  bankrolls,
  currency = "PEN",
  timeZone,
  height = 260,
}: BankrollLineChartProps) {
  const data = bankrolls.map((entry) => ({
    day: entry.date,
    bankroll: entry.bankroll,
  }));

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aún no hay historial de bankroll para graficar.
      </p>
    );
  }

  return (
    <div
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Evolución del bankroll en el tiempo"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
