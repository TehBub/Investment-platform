"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockPricePoint } from "@/lib/stock";

const TIMEFRAMES = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1m" },
  { label: "YTD", value: "ytd" },
] as const;

type Timeframe = (typeof TIMEFRAMES)[number]["value"];

function filterByTimeframe(
  data: StockPricePoint[],
  timeframe: Timeframe,
): StockPricePoint[] {
  switch (timeframe) {
    case "1d":
      return data.slice(-2);
    case "1w":
      return data.slice(-7);
    case "1m":
      return data.slice(-30);
    case "ytd": {
      const year = new Date().getFullYear();
      return data.filter((point) => point.date >= `${year}-01-01`);
    }
    default:
      return data;
  }
}

function formatTooltipDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-xs text-slate-500">{formatTooltipDate(label)}</p>
      <p className="text-sm font-semibold tabular-nums text-slate-900">
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function MainChart({ data }: { data: StockPricePoint[] }) {
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1m");

  const chartData = useMemo(
    () => filterByTimeframe(data, activeTimeframe),
    [data, activeTimeframe],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[480px] w-full items-center justify-center rounded-lg border border-slate-100 bg-white px-6 text-center">
        <p className="text-sm text-slate-500">Unable to load chart data.</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
        <div className="flex items-center justify-end border-b border-slate-100 px-4 py-3">
          <TimeframeToggle
            activeTimeframe={activeTimeframe}
            onChange={setActiveTimeframe}
          />
        </div>
        <div className="flex h-[480px] items-center justify-center px-6 text-sm text-slate-500">
          No data available for this timeframe.
        </div>
      </div>
    );
  }

  const prices = chartData.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.12 || 2;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
      <div className="flex items-center justify-end border-b border-slate-100 px-4 py-3">
        <TimeframeToggle
          activeTimeframe={activeTimeframe}
          onChange={setActiveTimeframe}
        />
      </div>

      <div className="h-[480px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 16, right: 8, left: 8, bottom: 8 }}
          >
            <defs>
              <linearGradient id="rddtPriceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="#f1f5f9"
              strokeDasharray="0"
            />

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={false}
            />

            <YAxis
              orientation="right"
              domain={[minPrice - padding, maxPrice + padding]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(value: number) => `$${value.toFixed(0)}`}
              width={48}
            />

            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                stroke: "#94a3b8",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            <Area
              type="monotone"
              dataKey="price"
              stroke="#2563eb"
              strokeWidth={2}
              fill="url(#rddtPriceGradient)"
              activeDot={{
                r: 4,
                fill: "#2563eb",
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TimeframeToggle({
  activeTimeframe,
  onChange,
}: {
  activeTimeframe: Timeframe;
  onChange: (timeframe: Timeframe) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {TIMEFRAMES.map((timeframe) => (
        <button
          key={timeframe.value}
          type="button"
          onClick={() => onChange(timeframe.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            activeTimeframe === timeframe.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {timeframe.label}
        </button>
      ))}
    </div>
  );
}
