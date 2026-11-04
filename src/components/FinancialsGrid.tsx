"use client";

import { useMemo, useState } from "react";

export type HistoricalFinancial = {
  id: string;
  ticker: string;
  statement_type: string;
  line_item: string;
  period_type: "annual" | "quarterly";
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string | null;
  accounting_standard: string;
  value: number | null;
  currency: string;
  display_order: number;
  source: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

type StatementType =
  | "income_statement"
  | "balance_sheet"
  | "cash_flow_statement";

const statementOptions: { label: string; value: StatementType }[] = [
  { label: "Income Statement", value: "income_statement" },
  { label: "Balance Sheet", value: "balance_sheet" },
  { label: "Cash Flow", value: "cash_flow_statement" },
];

const statementTitles: Record<StatementType, string> = {
  income_statement: "GAAP P&L Income Statement",
  balance_sheet: "GAAP Balance Sheet",
  cash_flow_statement: "GAAP Cash Flow Statement",
};

type PeriodColumn = {
  key: string;
  label: string;
  sortOrder: number;
};

type GridRow = {
  lineItem: string;
  displayOrder: number;
  values: Record<string, number | null>;
};

function getPeriodKey(row: HistoricalFinancial): string {
  if (row.source === "LTM") {
    return "ltm";
  }

  return `${row.period_type}-${row.fiscal_year}-${row.fiscal_quarter ?? "annual"}`;
}

function formatPeriodLabel(row: HistoricalFinancial): string {
  if (row.source === "LTM" && row.period_end_date) {
    const date = new Date(`${row.period_end_date}T00:00:00`);
    const month = date.toLocaleString("en-US", { month: "short" });
    const year = String(date.getFullYear() % 100).padStart(2, "0");
    return `${month} '${year} LTM`;
  }

  if (row.period_type === "annual") {
    const year = String(row.fiscal_year % 100).padStart(2, "0");
    return `Dec '${year}`;
  }

  if (row.fiscal_quarter) {
    const year = String(row.fiscal_year % 100).padStart(2, "0");
    return `Q${row.fiscal_quarter} '${year}`;
  }

  return String(row.fiscal_year);
}

function getPeriodSortOrder(row: HistoricalFinancial): number {
  if (row.source === "LTM") {
    return 1_000_000 + row.fiscal_year * 10 + (row.fiscal_quarter ?? 0);
  }

  if (row.period_type === "annual") {
    return row.fiscal_year * 10;
  }

  return row.fiscal_year * 10 + (row.fiscal_quarter ?? 0);
}

function pivotFinancials(data: HistoricalFinancial[]): {
  columns: PeriodColumn[];
  rows: GridRow[];
} {
  const periodMap = new Map<string, PeriodColumn>();
  const rowMap = new Map<string, GridRow>();

  for (const entry of data) {
    const periodKey = getPeriodKey(entry);

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        key: periodKey,
        label: formatPeriodLabel(entry),
        sortOrder: getPeriodSortOrder(entry),
      });
    }

    if (!rowMap.has(entry.line_item)) {
      rowMap.set(entry.line_item, {
        lineItem: entry.line_item,
        displayOrder: entry.display_order,
        values: {},
      });
    }

    const row = rowMap.get(entry.line_item)!;
    row.values[periodKey] = entry.value;
    row.displayOrder = Math.min(row.displayOrder, entry.display_order);
  }

  const columns = [...periodMap.values()].sort(
    (a, b) => b.sortOrder - a.sortOrder,
  );
  const rows = [...rowMap.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return { columns, rows };
}

function formatValue(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function FinancialsGrid({
  data,
  className,
}: {
  data: HistoricalFinancial[];
  className?: string;
}) {
  const [statementType, setStatementType] =
    useState<StatementType>("income_statement");

  const filteredData = useMemo(
    () => data.filter((row) => row.statement_type === statementType),
    [data, statementType],
  );

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm",
          className ?? "mt-6",
        )}
      >
        No financial data available.
      </div>
    );
  }

  const { columns, rows } = pivotFinancials(filteredData);

  return (
    <section
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white shadow-sm",
        className ?? "mt-6",
      )}
    >
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {statementTitles[statementType]}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Values in millions USD
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {statementOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatementType(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statementType === option.value
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-900",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">
          No data available for this statement yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[200px] border-r border-slate-200 bg-slate-50 px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)]"
                >
                  Line Item
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="whitespace-nowrap px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.lineItem}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 bg-white px-6 py-3 text-left font-medium text-slate-700 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)]"
                  >
                    {row.lineItem}
                  </th>
                  {columns.map((column) => {
                    const value = row.values[column.key] ?? null;

                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "whitespace-nowrap px-5 py-3 text-right tabular-nums",
                          value !== null && value < 0
                            ? "font-medium text-red-600"
                            : "font-medium text-slate-900",
                        )}
                      >
                        {formatValue(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
