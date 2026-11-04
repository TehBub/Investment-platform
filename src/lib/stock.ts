export type StockPricePoint = {
  date: string;
  price: number;
};

export type StockOverviewData = {
  companyName: string;
  description: string;
  marketCap: string;
  peRatio: string;
  week52High: string;
  week52Low: string;
  sector: string;
  volume: string;
  dividendYield: string;
};

export type StockApiResponse = {
  historicalData: StockPricePoint[];
  overview: StockOverviewData;
  quote: { c: number; pc: number; h?: number; l?: number };
};

type FinnhubCompanyProfile = {
  name?: string;
  ticker?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number;
};

type FinnhubQuote = {
  c?: number;
  pc?: number;
  h?: number;
  l?: number;
};

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const CACHE_REVALIDATE_SECONDS = 300;
const SYNTHETIC_HISTORY_DAYS = 30;
const EMPTY_FIELD = "—";

function getApiKey(): string {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error("Finnhub API key is not configured");
  }

  return apiKey;
}

function orDash(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY_FIELD;
}

async function fetchFinnhub<T extends Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${FINNHUB_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("token", apiKey);

  const response = await fetch(url.toString(), {
    next: { revalidate: CACHE_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`Finnhub request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as T & { error?: string };

  if (typeof payload.error === "string" && payload.error.length > 0) {
    throw new Error(`Finnhub API error: ${payload.error}`);
  }

  return payload;
}

export function formatMarketCap(value: string | undefined): string {
  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    return EMPTY_FIELD;
  }

  if (num >= 1_000_000_000_000) {
    return `$${(num / 1_000_000_000_000).toFixed(1)} T`;
  }

  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(1)} B`;
  }

  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)} M`;
  }

  return `$${num.toLocaleString("en-US")}`;
}

export function formatCompactNumber(
  value: string | undefined,
  options?: { prefix?: string; suffix?: string },
): string {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return EMPTY_FIELD;
  }

  const prefix = options?.prefix ?? "";
  const suffix = options?.suffix ?? "";

  return `${prefix}${num.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}${suffix}`;
}

export function formatPeRatio(value: string | undefined): string {
  if (!value || value === "None" || value === "-") {
    return EMPTY_FIELD;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : value;
}

export function formatPercent(value: string | undefined): string {
  if (!value || value === "None" || value === "0") {
    return EMPTY_FIELD;
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return EMPTY_FIELD;
  }

  return `${(num * 100).toFixed(2)}%`;
}

function mapFinnhubProfileToOverview(
  profile: FinnhubCompanyProfile,
): StockOverviewData {
  const marketCapInDollars =
    profile.marketCapitalization != null &&
    Number.isFinite(profile.marketCapitalization)
      ? String(profile.marketCapitalization * 1_000_000)
      : undefined;

  return {
    companyName: orDash(profile.name ?? profile.ticker),
    description: EMPTY_FIELD,
    marketCap: formatMarketCap(marketCapInDollars),
    peRatio: EMPTY_FIELD,
    week52High: EMPTY_FIELD,
    week52Low: EMPTY_FIELD,
    sector: orDash(profile.finnhubIndustry),
    volume: EMPTY_FIELD,
    dividendYield: EMPTY_FIELD,
  };
}

function formatUTCDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function hashTicker(ticker: string): number {
  let hash = 0;

  for (const char of ticker) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function seededNoise(index: number, seed: number): number {
  const value = Math.sin(seed + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Builds a 30-day synthetic series ending on `currentPrice`, anchored at `previousClose` on the prior day. */
export function generateSyntheticHistoricalData(
  currentPrice: number,
  previousClose: number,
  ticker: string,
  dayCount = SYNTHETIC_HISTORY_DAYS,
): StockPricePoint[] {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error("Current price must be a positive number");
  }

  if (!Number.isFinite(previousClose) || previousClose <= 0) {
    throw new Error("Previous close must be a positive number");
  }

  const seed = hashTicker(ticker);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const interiorCount = Math.max(dayCount - 2, 0);
  const prices: number[] = new Array(interiorCount);

  const monthTrend = (previousClose - currentPrice) / previousClose;
  const startPrice =
    previousClose * (1 + monthTrend * 2.5 + (seededNoise(0, seed) - 0.5) * 0.08);

  let price = startPrice;
  const dailyVolatility = Math.max(currentPrice, previousClose) * 0.012;

  for (let index = 0; index < interiorCount; index += 1) {
    const progress = interiorCount <= 1 ? 1 : index / (interiorCount - 1);
    const target = startPrice + (previousClose - startPrice) * progress;
    const noise = (seededNoise(index + 1, seed) - 0.5) * dailyVolatility * 2.4;
    const wave =
      Math.sin((index + seed % 7) * 0.85) * dailyVolatility * 0.6;

    price = target + noise + wave;
    prices[index] = Math.max(price, 0.01);
  }

  if (interiorCount > 0) {
    const lastInterior = prices[interiorCount - 1]!;
    const blend = 0.35;
    prices[interiorCount - 1] =
      lastInterior * (1 - blend) + previousClose * blend;
  }

  const points: StockPricePoint[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - (dayCount - 1 - index));

    let priceForDay: number;

    if (index === dayCount - 1) {
      priceForDay = currentPrice;
    } else if (index === dayCount - 2) {
      priceForDay = previousClose;
    } else {
      priceForDay = prices[index]!;
    }

    points.push({
      date: formatUTCDate(date),
      price: priceForDay,
    });
  }

  return points;
}

async function fetchQuote(ticker: string): Promise<FinnhubQuote> {
  const payload = await fetchFinnhub<FinnhubQuote>("/quote", {
    symbol: ticker,
  });

  if (payload.c == null || !Number.isFinite(payload.c)) {
    throw new Error("Finnhub quote response missing current price");
  }

  if (payload.pc == null || !Number.isFinite(payload.pc)) {
    throw new Error("Finnhub quote response missing previous close");
  }

  return payload;
}

async function fetchCompanyOverview(ticker: string): Promise<StockOverviewData> {
  const payload = await fetchFinnhub<FinnhubCompanyProfile>("/stock/profile2", {
    symbol: ticker,
  });

  if (!payload.name && !payload.ticker) {
    throw new Error("Finnhub profile response missing company data");
  }

  return mapFinnhubProfileToOverview(payload);
}

export async function fetchStockData(ticker: string): Promise<StockApiResponse> {
  const symbol = ticker.trim().toUpperCase();

  if (!symbol) {
    throw new Error("Ticker is required");
  }

  const [quote, overview] = await Promise.all([
    fetchQuote(symbol),
    fetchCompanyOverview(symbol),
  ]);

  const historicalData = generateSyntheticHistoricalData(
    quote.c!,
    quote.pc!,
    symbol,
  );

  return {
    historicalData,
    overview,
    quote: { c: quote.c!, pc: quote.pc!, h: quote.h, l: quote.l },
  };
}

/** @deprecated Use fetchStockData instead */
export async function fetchStockPrices(
  ticker: string,
): Promise<StockPricePoint[]> {
  const { historicalData } = await fetchStockData(ticker);
  return historicalData;
}

export function calculateStockStats(
  historicalData: StockPricePoint[],
  quote?: Pick<FinnhubQuote, "c" | "pc" | "h" | "l">,
) {
  const livePrice = quote?.c ?? historicalData.at(-1)?.price ?? 0;
  const previousClose = quote?.pc ?? historicalData.at(-2)?.price ?? livePrice;
  const changePercent =
    previousClose !== 0
      ? ((livePrice - previousClose) / previousClose) * 100
      : 0;

  const dayRange =
    quote?.h != null &&
    quote.l != null &&
    Number.isFinite(quote.h) &&
    Number.isFinite(quote.l)
      ? { low: quote.l, high: quote.h }
      : (() => {
          const recentTwo = historicalData.slice(-2).map((point) => point.price);
          return recentTwo.length > 0
            ? { low: Math.min(...recentTwo), high: Math.max(...recentTwo) }
            : { low: livePrice, high: livePrice };
        })();

  return {
    livePrice,
    previousClose,
    changePercent,
    dayRange,
  };
}
