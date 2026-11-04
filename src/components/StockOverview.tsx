"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import FinancialsGrid, {
  type HistoricalFinancial,
} from "@/components/FinancialsGrid";
import MainChart from "@/components/MainChart";
import type { StockOverviewData, StockPricePoint } from "@/lib/stock";

type Tab = "Overview" | "Financials" | "Charts" | "News";

const tabs: Tab[] = ["Overview", "Financials", "Charts", "News"];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function StockOverview({
  ticker,
  financials,
  historicalData,
  overview,
  livePrice,
  changePercent,
  previousClose,
  dayRange,
}: {
  ticker: string;
  financials: HistoricalFinancial[];
  historicalData: StockPricePoint[];
  overview: StockOverviewData;
  livePrice: number;
  changePercent: number;
  previousClose: number;
  dayRange: { low: number; high: number };
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const isPositive = changePercent >= 0;
  const hasLivePrices = historicalData.length > 0;

  const detailRows = [
    {
      label: "Previous Close",
      value: hasLivePrices ? previousClose.toFixed(2) : "—",
    },
    {
      label: "Day Range",
      value: hasLivePrices
        ? `${dayRange.low.toFixed(2)} – ${dayRange.high.toFixed(2)}`
        : "—",
    },
    {
      label: "52-Week Range",
      value: `${overview.week52Low} – ${overview.week52High}`,
    },
    { label: "Volume", value: overview.volume },
    { label: "Dividend Yield", value: overview.dividendYield },
    { label: "P/E Ratio", value: overview.peRatio },
  ];

  return (
    <>
      <nav className="flex gap-8 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "border-b-2 py-4 text-sm font-medium transition-colors",
              activeTab === tab
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="mt-4 w-full rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 px-8 py-5">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {ticker}
              </h1>
              <span className="text-base text-slate-500">
                {overview.companyName}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-3xl font-semibold tracking-tight text-slate-900">
                {hasLivePrices ? `$${livePrice.toFixed(2)}` : "—"}
              </span>
              {hasLivePrices && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-sm font-medium",
                    isPositive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-600",
                  )}
                >
                  {isPositive ? "+" : ""}
                  {changePercent.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <Metric label="Market Cap" value={overview.marketCap} />
        </div>

        <div className="flex w-full divide-x divide-slate-200 px-8 py-5">
          <Metric label="Sector" value={overview.sector} className="flex-1" />
          <Metric
            label="P/E Ratio"
            value={overview.peRatio}
            className="flex-1 pl-8"
          />
        </div>
      </div>

      {activeTab === "Overview" && (
        <div className="mt-4 flex w-full min-w-0 flex-row gap-6">
          <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="px-6 pb-6 pt-4">
              <MainChart data={historicalData} />
            </div>
          </section>

          <aside className="w-[320px] shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Details</h2>
              <div className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                <span>24 h</span>
              </div>
            </div>

            <div className="px-5">
              {detailRows.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-3"
                >
                  <span className="shrink-0 text-sm text-slate-500">{label}</span>
                  <span className="text-right text-sm font-medium text-slate-900">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {activeTab === "Financials" && (
        <FinancialsGrid data={financials} className="mt-4" />
      )}

      {activeTab !== "Overview" && activeTab !== "Financials" && (
        <div className="mt-4 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-24 text-sm text-slate-500 shadow-sm">
          {activeTab} view coming soon.
        </div>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
