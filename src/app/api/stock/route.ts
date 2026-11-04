import { NextRequest, NextResponse } from "next/server";
import { fetchStockData } from "@/lib/stock";

export type {
  StockApiResponse,
  StockOverviewData,
  StockPricePoint,
} from "@/lib/stock";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  try {
    const data = await fetchStockData(ticker);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch stock data";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
