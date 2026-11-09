import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { inr } from "@/lib/format";

const axis = { stroke: "#94a3b8", fontSize: 11 };
const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 12px 30px -18px rgba(15,23,42,0.4)",
};
const compact = (value: any) =>
  Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : value;

export function MonthlyProfitChart({ data }: any) {
  const chartData = (data || []).map((row: any) => ({
    ...row,
    profitPositive: row.profit > 0 ? row.profit : null,
    profitNegative: row.profit < 0 ? row.profit : null,
    profitZero: row.profit === 0 ? 0 : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={chartData}
        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#eef2f7"
          vertical={false}
        />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={compact}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => inr(value)}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="collected"
          name="Collected"
          fill="#1d6fe0"
          radius={[4, 4, 0, 0]}
          barSize={16}
        />
        <Bar
          dataKey="expenses"
          name="Expenses"
          fill="#c4b5fd"
          radius={[4, 4, 0, 0]}
          barSize={16}
        />
        <Line type="monotone" dataKey="profitPositive" name="Profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} connectNulls={false} />
        <Line type="monotone" dataKey="profitNegative" name="Loss" stroke="#e11d48" strokeWidth={2} dot={{ r: 3, fill: "#e11d48" }} connectNulls={false} />
        <Line type="monotone" dataKey="profitZero" name="Break-even" stroke="#64748b" strokeWidth={2} dot={{ r: 3, fill: "#64748b" }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function YearlyProfitChart({ data }: any) {
  const chartData = (data || []).map((row: any) => ({
    ...row,
    profitPositive: row.profit > 0 ? row.profit : null,
    profitNegative: row.profit < 0 ? row.profit : null,
    profitZero: row.profit === 0 ? 0 : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={chartData}
        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#eef2f7"
          vertical={false}
        />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={compact}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => inr(value)}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="invoiced"
          name="Invoiced"
          fill="#8b5cf6"
          radius={[4, 4, 0, 0]}
          barSize={18}
        />
        <Bar
          dataKey="collected"
          name="Collected"
          fill="#1d6fe0"
          radius={[4, 4, 0, 0]}
          barSize={18}
        />
        <Bar
          dataKey="expenses"
          name="Expenses"
          fill="#c4b5fd"
          radius={[4, 4, 0, 0]}
          barSize={18}
        />
        <Line type="monotone" dataKey="profitPositive" name="Profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} connectNulls={false} />
        <Line type="monotone" dataKey="profitNegative" name="Loss" stroke="#e11d48" strokeWidth={2} dot={{ r: 3, fill: "#e11d48" }} connectNulls={false} />
        <Line type="monotone" dataKey="profitZero" name="Break-even" stroke="#64748b" strokeWidth={2} dot={{ r: 3, fill: "#64748b" }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ExpenseTrendChart({ data }: any) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#eef2f7"
          vertical={false}
        />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={compact}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => inr(value)}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="expenses"
          name="Spend"
          fill="#f472b6"
          radius={[4, 4, 0, 0]}
          barSize={18}
        />
        <Line
          type="monotone"
          dataKey="profit"
          name="Net after spend"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
