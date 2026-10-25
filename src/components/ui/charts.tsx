"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = {
  stroke: "var(--muted)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--line-strong)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--ink)",
  boxShadow: "0 12px 30px -20px rgba(0,0,0,.8)",
};

export function TrendChart({
  data,
  dataKey = "value",
  xKey = "label",
  height = 220,
  color = "var(--accent)",
  type = "area",
  valuePrefix,
  valueSuffix,
}: {
  data: { label: string; [key: string]: string | number }[];
  dataKey?: string;
  xKey?: string;
  height?: number;
  color?: string;
  type?: "area" | "line" | "bar";
  valuePrefix?: string;
  valueSuffix?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
        No data yet
      </div>
    );
  }
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
      <XAxis dataKey={xKey} {...axis} />
      <YAxis {...axis} width={36} />
      <Tooltip
        contentStyle={tooltipStyle}
        formatter={(value) => [`${valuePrefix ?? ""}${value}${valueSuffix ?? ""}`, ""]}
        labelStyle={{ color: "var(--muted)" }}
        cursor={{ fill: "rgba(255,255,255,0.04)" }}
      />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      {type === "bar" ? (
        <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          {common}
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      ) : type === "line" ? (
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          {common}
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} />
        </LineChart>
      ) : (
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mmaTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {common}
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} fill="url(#mmaTrend)" />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

const COLORS = ["#B8F36B", "#60A5FA", "#F59E0B", "#F472B6", "#A78BFA", "#34D399", "#FB7185", "#FBBF24"];

export function DonutChart({
  data,
  height = 200,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
        No data yet
      </div>
    );
  }
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="stat-value text-xl">{centerValue}</span>
          {centerLabel ? (
            <span className="text-[0.7rem] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ChartLegend({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {data.map((entry, index) => (
        <li key={entry.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 truncate">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
            <span className="truncate" style={{ color: "var(--muted)" }}>
              {entry.label}
            </span>
          </span>
          <span className="stat-value">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}
