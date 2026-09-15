"use client";

import type { ComparisonSummary } from "@/lib/types";

interface Props {
  summary: ComparisonSummary;
  onReset: () => void;
}

interface StatBadgeProps {
  count: number;
  label: string;
  colorClass: string;
}

function StatBadge({ count, label, colorClass }: StatBadgeProps) {
  return (
    <div className={`flex flex-col items-center px-5 py-3 rounded-lg ${colorClass}`}>
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-xs font-medium mt-0.5 uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function DifferenceSummary({ summary, onReset }: Props) {
  const total = summary.changed + summary.new + summary.removed;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Analysis Complete</h2>
          <p className="text-sm text-gray-500">
            {total === 0
              ? "No meaningful differences were detected."
              : `${total} meaningful difference${total !== 1 ? "s" : ""} detected.`}
          </p>
        </div>
        <button
          onClick={onReset}
          className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Compare New Documents
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatBadge
          count={summary.changed}
          label="Changed"
          colorClass="bg-amber-50 text-amber-700"
        />
        <StatBadge
          count={summary.new}
          label="New"
          colorClass="bg-green-50 text-green-700"
        />
        <StatBadge
          count={summary.removed}
          label="Removed"
          colorClass="bg-red-50 text-red-700"
        />
        <StatBadge
          count={summary.unchanged}
          label="Unchanged"
          colorClass="bg-gray-100 text-gray-500"
        />
      </div>
    </div>
  );
}
