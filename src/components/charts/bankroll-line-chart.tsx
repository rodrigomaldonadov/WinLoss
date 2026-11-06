"use client";

import {
  Area,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/format";
import type { BankrollSummary } from "@/lib/types";

type BankrollLineChartProps = {
  bankrolls: { date: string; bankroll: number }[];
  width?: number;
  height?: number;
};

export function BankrollLineChart({
  bankrolls,
  width = 600,
  height = 300,
}: BankrollLineChartProps) {
  // Datos ya vienen acumulados día a día
  const data = bankrolls.map((entry) => ({
    day: entry.date,
    profit: entry.bankroll,
  }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <div>
        <Line type="monotone" dataKey="profit" stroke="#8884d8" activeDot={{ r: 8 }} />
        <Area type="monotone" dataKey="profit" fill="#8884d8" fillOpacity={0.4} />
        <XAxis dataKey="day" label={{ value: "Día" }} />
        <YAxis label={{ value: "Beneficio (S/)" }} />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip formatter={(value) => `$${value}`} />
      </div>
    </ResponsiveContainer>
  );
}