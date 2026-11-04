"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  Coins,
  LayoutDashboard,
  LifeBuoy,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  TrendingUp,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Exchange", href: "/exchange", icon: ArrowLeftRight },
  { label: "Watchlist", href: "/watchlist", icon: Star },
  { label: "News", href: "/news", icon: Newspaper },
  { label: "Crypto", href: "/crypto", icon: Coins },
  { label: "Support", href: "/support", icon: LifeBuoy },
] as const;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="flex min-h-screen w-full flex-1">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out",
          isExpanded ? "w-60" : "w-[4.5rem]",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 border-b border-slate-200",
            isExpanded
              ? "h-14 items-center gap-2 px-4"
              : "flex-col items-center gap-2 py-3",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-white shadow-sm">
              <TrendingUp className="h-4 w-4" strokeWidth={2.25} />
            </div>
            {isExpanded && (
              <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
                Logo
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900"
          >
            {isExpanded ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-1">
            {navItems.map(({ label, href, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);

              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={!isExpanded ? label : undefined}
                    className={cn(
                      "group flex items-center rounded-lg text-sm font-medium transition-colors",
                      isExpanded ? "gap-3 px-3 py-2.5" : "justify-center p-2.5",
                      isActive
                        ? "bg-blue-50 text-blue-900"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[1.125rem] w-[1.125rem] shrink-0",
                        isActive
                          ? "text-blue-900"
                          : "text-slate-400 group-hover:text-slate-600",
                      )}
                      strokeWidth={2}
                    />
                    {isExpanded && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="min-h-screen min-w-0 w-full max-w-none flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
        {children}
      </main>
    </div>
  );
}
