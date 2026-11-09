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

/**
 * Draw one continuous monthly result line, colouring each segment by its
 * actual sign. When a segment crosses zero, split it exactly at the baseline
 * so profit stays green and loss stays red.
 */
function renderProfitLossSegments(props: any) {
  const points = (props.points || []).filter(
    (point: any) => Number.isFinite(Number(point?.payload?.profit ?? point?.value)) &&
      Number.isFinite(point?.x) && Number.isFinite(point?.y),
  );
  const segments: Array<{ d: string; color: string; key: string }> = [];
  const colorFor = (value: number) =>
    value > 0 ? "#10b981" : value < 0 ? "#e11d48" : "#64748b";

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const av = Number(a.payload?.profit ?? a.value);
    const bv = Number(b.payload?.profit ?? b.value);
    const aSign = Math.sign(av);
    const bSign = Math.sign(bv);

    if (aSign === bSign || aSign === 0 || bSign === 0) {
      const sign = aSign || bSign;
      segments.push({
        key: `segment-${i}`,
        d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
        color: colorFor(sign),
      });
      continue;
    }

    // Interpolate the exact point where the monthly result crosses zero.
    const t = av / (av - bv);
    const zeroX = a.x + (b.x - a.x) * t;
    const zeroY = a.y + (b.y - a.y) * t;
    segments.push({
      key: `segment-${i}-first`,
      d: `M ${a.x} ${a.y} L ${zeroX} ${zeroY}`,
      color: colorFor(av),
    });
    segments.push({
      key: `segment-${i}-second`,
      d: `M ${zeroX} ${zeroY} L ${b.x} ${b.y}`,
      color: colorFor(bv),
    });
  }

  return (
    <g>
      {segments.map((segment) => (
        <path
          key={segment.key}
          d={segment.d}
          fill="none"
          stroke={segment.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

function renderProfitLossDot(props: any) {
  const value = Number(props.payload?.profit ?? props.value ?? 0);
  const color = value > 0 ? "#10b981" : value < 0 ? "#e11d48" : "#64748b";
  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={3.5}
      fill={color}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
}

function renderProfitLegend({ payload = [] }: any) {
  const entries = (payload || []).filter((entry: any) =>
    ["Collected", "Expenses", "Invoiced"].includes(entry.value),
  );
  const statuses = [
    { label: "Profit", color: "#10b981" },
    { label: "Loss", color: "#e11d48" },
    { label: "Break-even", color: "#64748b" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
      {entries.map((entry: any) => (
        <span key={entry.value} className="inline-flex items-center gap-1.5" style={{ color: entry.color }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </span>
      ))}
      {statuses.map((entry) => (
        <span key={entry.label} className="inline-flex items-center gap-1.5" style={{ color: entry.color }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

export function MonthlyProfitChart({ data }: any) {
  const chartData = data || [];
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
        <Legend content={renderProfitLegend} />
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
        <Line
          type="linear"
          dataKey="profit"
          name="Monthly profit / loss"
          stroke="none"
          strokeWidth={0}
          dot={renderProfitLossDot}
          activeDot={renderProfitLossDot}
          shape={renderProfitLossSegments}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function YearlyProfitChart({ data }: any) {
  const chartData = data || [];
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
        <Legend content={renderProfitLegend} />
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
        <Line
          type="linear"
          dataKey="profit"
          name="Annual profit / loss"
          stroke="none"
          strokeWidth={0}
          dot={renderProfitLossDot}
          activeDot={renderProfitLossDot}
          shape={renderProfitLossSegments}
          connectNulls={false}
        />
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
