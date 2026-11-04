import SearchBar from "@/components/SearchBar";
import { StockOverview } from "@/components/StockOverview";
import { calculateStockStats, fetchStockData } from "@/lib/stock";
import { fetchHistoricalFinancials } from "@/lib/supabase";

type HomeProps = {
  searchParams: Promise<{ ticker?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { ticker: tickerParam } = await searchParams;
  const ticker = (tickerParam ?? "RDDT").toUpperCase();

  const [financialsResult, stockResult] = await Promise.allSettled([
    fetchHistoricalFinancials(ticker),
    fetchStockData(ticker),
  ]);

  if (stockResult.status === "rejected") {
    throw stockResult.reason;
  }

  const financials =
    financialsResult.status === "fulfilled" ? financialsResult.value : [];
  const financialsFetchFailed = financialsResult.status === "rejected";
  const stockData = stockResult.value;

  const { historicalData, overview, quote } = stockData;
  const stats = calculateStockStats(historicalData, quote);

  return (
    <div className="flex h-full w-full flex-col px-6 pb-6 pt-4 sm:px-8 sm:pb-8">
      <div className="mb-4">
        <SearchBar />
      </div>

      {financialsFetchFailed && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Financials data is temporarily unavailable. Check your Supabase project
          URL in <code className="text-xs">.env.local</code> — the configured
          host could not be reached.
        </div>
      )}

      <StockOverview
        ticker={ticker}
        financials={financials}
        historicalData={historicalData}
        overview={overview}
        livePrice={stats.livePrice}
        changePercent={stats.changePercent}
        previousClose={stats.previousClose}
        dayRange={stats.dayRange}
      />
    </div>
  );
}
