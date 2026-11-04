import { createClient } from "@supabase/supabase-js";
import type { HistoricalFinancial } from "@/components/FinancialsGrid";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function fetchHistoricalFinancials(
  ticker: string,
): Promise<HistoricalFinancial[]> {
  const symbol = ticker.trim().toUpperCase();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("historical_financials")
    .select("*")
    .eq("ticker", symbol)
    .order("display_order", { ascending: true })
    .order("fiscal_year", { ascending: false })
    .order("fiscal_quarter", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(
      `Failed to fetch financials for ${symbol}: ${error.message}`,
    );
  }

  return (data ?? []) as HistoricalFinancial[];
}
