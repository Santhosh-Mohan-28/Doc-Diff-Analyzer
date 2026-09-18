"use client";

import { useState } from "react";
import type { DifferenceItem, FilterType } from "@/lib/types";
import DifferenceCard from "./DifferenceCard";

interface Props {
  differences: DifferenceItem[];
}

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All changes",
  changed: "Changed",
  new: "New",
  removed: "Removed",
};

const FILTER_STYLES: Record<
  FilterType,
  {
    active: string;
    dot: string;
  }
> = {
  all: {
    active: "bg-slate-950 text-white border-slate-950",
    dot: "bg-white",
  },
  changed: {
    active: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  new: {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  removed: {
    active: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

export default function ComparisonView({ differences }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");

  // Only meaningful differences are shown in the report.
  const meaningfulDifferences = differences.filter(
    (d) =>
      d.type === "changed" ||
      d.type === "new" ||
      d.type === "removed"
  );

  const counts: Record<FilterType, number> = {
    all: meaningfulDifferences.length,
    changed: meaningfulDifferences.filter((d) => d.type === "changed").length,
    new: meaningfulDifferences.filter((d) => d.type === "new").length,
    removed: meaningfulDifferences.filter((d) => d.type === "removed").length,
  };

  const visible =
    filter === "all"
      ? meaningfulDifferences
      : meaningfulDifferences.filter((d) => d.type === filter);

  if (meaningfulDifferences.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-lg shadow-slate-900/[0.03]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />

        <div className="flex flex-col items-center px-6 py-16 text-center sm:py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="h-7 w-7"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m5 12 4.5 4.5L19 7"
              />
            </svg>
          </div>

          <h3 className="mt-6 text-lg font-semibold tracking-tight text-slate-900">
            No meaningful differences detected
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            The documents appear to convey the same information. Formatting,
            wording, synonyms, and reordered content were intentionally
            excluded.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Semantically equivalent
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* Section heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">
            Detailed findings
          </p>

          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Meaningful differences
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Review each detected change with its supporting document evidence.
          </p>
        </div>

        <div className="hidden text-right sm:block">
          <p className="text-2xl font-bold tracking-tight text-slate-900">
            {visible.length}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Showing
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="sticky top-4 z-10 rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-sm backdrop-blur-xl">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => {
            const active = filter === f;

            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`
                  inline-flex shrink-0 items-center gap-2 rounded-xl border
                  px-3.5 py-2 text-xs font-semibold
                  transition-all duration-200
                  ${
                    active
                      ? FILTER_STYLES[f].active
                      : "border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                  }
                `}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active
                      ? FILTER_STYLES[f].dot
                      : f === "changed"
                        ? "bg-amber-400"
                        : f === "new"
                          ? "bg-emerald-500"
                          : "bg-red-500"
                  }`}
                />

                {FILTER_LABELS[f]}

                <span
                  className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[10px] ${
                    active
                      ? f === "all"
                        ? "bg-white/15 text-white"
                        : "bg-white/70"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {counts[f]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h10M4 18h7"
              />
            </svg>
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-700">
            No {FILTER_LABELS[filter].toLowerCase()} found
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Try another filter to view the detected differences.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item, index) => (
            <div
              key={item.id}
              className="animate-fade-up h-full"
              style={{
                animationDelay: `${Math.min(index * 45, 400)}ms`,
              }}
            >
              <DifferenceCard item={item} />
            </div>
          ))}
        </div>
      )}

      {/* Bottom information */}
      {visible.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2 text-center">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Evidence-backed results
          </p>
        </div>
      )}
    </section>
  );
}