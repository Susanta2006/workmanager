import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

const PALETTE = [
  "#1d6fe0",
  "#06b6d4",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#64748b",
];

export function RevenueExpenseChart({ data }: any) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
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
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => inr(value)}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="received"
          name="Cash received"
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
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CollectionsChart({ data }: any) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
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
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => inr(value)}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="invoiced"
          name="Invoiced"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="collected"
          name="Received"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data, dataKey = "value" }: any) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey="label"
          innerRadius={52}
          outerRadius={82}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry: any, index: any) => (
            <Cell key={entry.label} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ExpenseCategoryChart({ data }: any) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#eef2f7"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={axis}
          axisLine={false}
          tickLine={false}
          width={78}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => inr(value)}
        />
        <Bar
          dataKey="value"
          name="Spent"
          fill="#8b5cf6"
          radius={[0, 4, 4, 0]}
          barSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
