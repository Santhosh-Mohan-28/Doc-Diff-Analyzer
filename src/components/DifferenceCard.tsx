"use client";

import { useState } from "react";
import type { DifferenceItem, PresentationHint } from "@/lib/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  changed: {
    badge: "Changed",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    accentClass: "bg-amber-400",
    iconClass: "bg-amber-50 text-amber-600",
  },
  new: {
    badge: "New",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accentClass: "bg-emerald-500",
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  removed: {
    badge: "Removed",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    accentClass: "bg-red-500",
    iconClass: "bg-red-50 text-red-600",
  },
} as const;

const HINT_LABELS: Record<PresentationHint, string> = {
  "value-change": "Value",
  "policy-change": "Policy",
  "condition-change": "Condition",
  "procedure-change": "Procedure",
  "new-item": "New item",
  "removed-item": "Removed item",
  "multi-change": "Multiple",
  "date-change": "Date",
  "definition-change": "Definition",
};

// ---------------------------------------------------------------------------
// Compact heading
// ---------------------------------------------------------------------------

function getCompactHeading(topic: string): string {
  const cleaned = topic.trim().replace(/\s+/g, " ");

  if (!cleaned) {
    return "Difference";
  }

  const words = cleaned.split(" ");

  return words.slice(0, 2).join(" ");
}

// ---------------------------------------------------------------------------
// Compact description
// ---------------------------------------------------------------------------

function cleanValue(value?: string): string {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function getCollapsedDescription(item: DifferenceItem): string {
  const previousValue = cleanValue(item.previous?.value);
  const currentValue = cleanValue(item.current?.value);

  if (item.type === "changed") {
    if (previousValue && currentValue) {
      return `Changed from ${previousValue} to ${currentValue}`;
    }

    if (currentValue) {
      return `Changed to ${currentValue}`;
    }

    if (previousValue) {
      return `Changed from ${previousValue}`;
    }

    return "Information has changed";
  }

  if (item.type === "new") {
    if (currentValue) {
      return `${currentValue} was added`;
    }

    return "New information was added";
  }

  if (item.type === "removed") {
    if (previousValue) {
      return `${previousValue} was removed`;
    }

    return "Information was removed";
  }

  return "Meaningful difference detected";
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChangeIcon({ type }: { type: DifferenceItem["type"] }) {
  if (type === "changed") {
    return (
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
          d="M7 7h10M17 7l-3-3M17 7l-3 3M17 17H7M7 17l3-3M7 17l3 3"
        />
      </svg>
    );
  }

  if (type === "new") {
    return (
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
          d="M12 5v14M5 12h14"
        />
      </svg>
    );
  }

  return (
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
        d="M6 12h12"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className={`h-4 w-4 transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m5 7.5 5 5 5-5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 10 3.2 3.2L15.5 5.5"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Source block
// ---------------------------------------------------------------------------

function SourceBlock({
  label,
  content,
  value,
  source,
  variant,
}: {
  label: string;
  content: string;
  value?: string;
  source?: {
    page: number;
    section?: string;
  };
  variant: "previous" | "current";
}) {
  const isPrevious = variant === "previous";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 ${
        isPrevious
          ? "border-red-100 bg-red-50/50"
          : "border-emerald-100 bg-emerald-50/50"
      }`}
    >
      <div
        className={`absolute left-0 top-0 h-full w-1 ${
          isPrevious ? "bg-red-400" : "bg-emerald-500"
        }`}
      />

      <div className="flex items-center justify-between gap-3">
        <div
          className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
            isPrevious ? "text-red-500" : "text-emerald-600"
          }`}
        >
          {label}
        </div>

        {source && (
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
              isPrevious
                ? "border-red-100 bg-white/60 text-red-400"
                : "border-emerald-100 bg-white/60 text-emerald-500"
            }`}
          >
            Page {source.page}
            {source.section ? ` · ${source.section}` : ""}
          </span>
        )}
      </div>

      {value && (
        <p
          className={`mt-4 text-base font-semibold ${
            isPrevious ? "text-red-800" : "text-emerald-800"
          }`}
        >
          {value}
        </p>
      )}

      <p
        className={`mt-2 text-sm leading-6 ${
          isPrevious ? "text-red-700/80" : "text-emerald-700/80"
        }`}
      >
        {content}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  item: DifferenceItem;
}

export default function DifferenceCard({ item }: Props) {
  // Cards start collapsed.
  const [expanded, setExpanded] = useState(false);

  const config = TYPE_CONFIG[item.type];
  const hintLabel = HINT_LABELS[item.presentationHint];
  const compactHeading = getCompactHeading(item.topic);
  const collapsedDescription = getCollapsedDescription(item);

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/[0.04]">
      {/* Type accent */}
      <div
        className={`absolute left-0 top-0 h-full w-1 ${config.accentClass}`}
      />

      {/* Header */}
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left sm:px-6"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-start gap-3.5">
          {/* Type icon */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.iconClass}`}
          >
            <ChangeIcon type={item.type} />
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            {/* Type */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${config.badgeClass}`}
              >
                {config.badge}
              </span>

              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">
                {hintLabel}
              </span>
            </div>

            {/* Short heading */}
            <h3 className="mt-2.5 text-sm font-semibold leading-5 text-slate-900 sm:text-base">
              {compactHeading}
            </h3>

            {/* Actual change description */}
            {!expanded && (
              <p className="mt-1.5 whitespace-normal break-words text-xs font-medium leading-5 text-slate-500">
                {collapsedDescription}
              </p>
            )}
          </div>
        </div>

        {/* Expand / collapse */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition-colors group-hover:bg-slate-100">
          <ChevronIcon expanded={expanded} />
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-6 pt-5 sm:px-6">
          {/* Explanation */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              What changed
            </p>

            <p className="mt-2 text-sm leading-7 text-slate-600">
              {item.explanation}
            </p>
          </div>

          {/* Previous / Current */}
          {(item.previous || item.current) && (
            <div
              className={`grid gap-4 ${
                item.previous && item.current
                  ? "grid-cols-1 lg:grid-cols-2"
                  : "grid-cols-1"
              }`}
            >
              {item.previous && (
                <SourceBlock
                  label="Previous version"
                  content={item.previous.content}
                  value={item.previous.value}
                  source={item.previous.source}
                  variant="previous"
                />
              )}

              {item.current && (
                <SourceBlock
                  label="Current version"
                  content={item.current.content}
                  value={item.current.value}
                  source={item.current.source}
                  variant="current"
                />
              )}
            </div>
          )}

          {/* Footer metadata */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <CheckIcon />
              </span>
              Evidence validated
            </div>

            <div className="h-3 w-px bg-slate-200" />

            <span className="text-[10px] text-slate-400">
              {item.comparisonMethod === "ai-assisted"
                ? "Semantic + AI comparison"
                : "Deterministic comparison"}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}