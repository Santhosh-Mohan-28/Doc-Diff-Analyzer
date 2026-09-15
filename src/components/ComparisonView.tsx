"use client";

import { useState } from "react";
import type { DifferenceItem, FilterType } from "@/lib/types";
import DifferenceCard from "./DifferenceCard";

interface Props {
  differences: DifferenceItem[];
}

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  changed: "Changed",
  new: "New",
  removed: "Removed",
};

export default function ComparisonView({ differences }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");

  const counts: Record<FilterType, number> = {
    all: differences.length,
    changed: differences.filter((d) => d.type === "changed").length,
    new: differences.filter((d) => d.type === "new").length,
    removed: differences.filter((d) => d.type === "removed").length,
  };

  const visible =
    filter === "all" ? differences : differences.filter((d) => d.type === filter);

  if (differences.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center space-y-2">
        <p className="text-4xl">✓</p>
        <p className="font-semibold text-gray-700">No meaningful differences detected</p>
        <p className="text-sm text-gray-400 max-w-sm mx-auto">
          The documents appear to convey the same information. Any formatting or wording
          differences were intentionally excluded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border
              ${
                filter === f
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
              }`}
          >
            {FILTER_LABELS[f]}
            <span
              className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 font-semibold
                ${filter === f ? "bg-blue-500 text-blue-100" : "bg-gray-100 text-gray-500"}`}
            >
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No {filter} items found.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <DifferenceCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
