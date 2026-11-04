"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");

  const currentTicker = searchParams.get("ticker")?.toUpperCase() ?? "RDDT";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const ticker = searchInput.trim().toUpperCase();

    if (!ticker) {
      return;
    }

    router.push(`/?ticker=${ticker}`);
    setSearchInput("");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
        />
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={`Search for stocks & more (viewing ${currentTicker})`}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>
    </form>
  );
}
