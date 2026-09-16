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
  icon: React.ReactNode;
}

function StatBadge({
  count,
  label,
  colorClass,
  icon,
}: StatBadgeProps) {
  return (
    <div
      className={`group flex min-w-[130px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${colorClass}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70">
        {icon}
      </div>

      <div>
        <div className="text-xl font-bold tracking-tight">{count}</div>
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
          {label}
        </div>
      </div>
    </div>
  );
}

function ChangedIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 4v12M4 10h12"
      />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 3.5v13M3.5 10h13"
      />
      <circle cx="10" cy="10" r="7.5" />
    </svg>
  );
}

function RemovedIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 10h10"
      />
      <circle cx="10" cy="10" r="7.5" />
    </svg>
  );
}

function UnchangedIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m5.5 10 3 3 6-6"
      />
    </svg>
  );
}

export default function DifferenceSummary({
  summary,
  onReset,
}: Props) {
  const total = summary.changed + summary.new + summary.removed;
  const hasChanges = total > 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/[0.04]">
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              hasChanges
                ? "bg-indigo-50 text-indigo-600"
                : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {hasChanges ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 17.5 9 12l3.5 3.5L20 8"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 8h5v5"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m5 12 4 4L19 6"
                />
              </svg>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Analysis complete
              </h2>

              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  hasChanges
                    ? "bg-indigo-50 text-indigo-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {hasChanges ? "Changes found" : "No changes"}
              </span>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              {hasChanges
                ? `${total} meaningful difference${
                    total !== 1 ? "s" : ""
                  } detected between the documents.`
                : "No meaningful differences were detected."}
            </p>
          </div>
        </div>

        <button
          onClick={onReset}
          className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.5 10a5.5 5.5 0 0 1-9.6 3.7L4.5 12"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 15v-3h3"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 10a5.5 5.5 0 0 1 9.6-3.7l1.4 1.7"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.5 5v3h-3"
            />
          </svg>
          Compare new documents
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6">
        <StatBadge
          count={summary.changed}
          label="Changed"
          colorClass="border-amber-100 bg-amber-50/70 text-amber-700"
          icon={<ChangedIcon />}
        />

        <StatBadge
          count={summary.new}
          label="New"
          colorClass="border-emerald-100 bg-emerald-50/70 text-emerald-700"
          icon={<NewIcon />}
        />

        <StatBadge
          count={summary.removed}
          label="Removed"
          colorClass="border-red-100 bg-red-50/70 text-red-700"
          icon={<RemovedIcon />}
        />

        <StatBadge
          count={summary.unchanged}
          label="Unchanged"
          colorClass="border-slate-200 bg-slate-50 text-slate-500"
          icon={<UnchangedIcon />}
        />
      </div>
    </div>
  );
}