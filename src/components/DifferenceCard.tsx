"use client";

import { useState } from "react";
import type { DifferenceItem, PresentationHint } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  changed: {
    badge: "Changed",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    borderClass: "border-l-amber-400",
    icon: "⟷",
  },
  new: {
    badge: "New",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    borderClass: "border-l-green-400",
    icon: "+",
  },
  removed: {
    badge: "Removed",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    borderClass: "border-l-red-400",
    icon: "−",
  },
} as const;

const HINT_LABELS: Record<PresentationHint, string> = {
  "value-change": "Value",
  "policy-change": "Policy",
  "condition-change": "Condition",
  "procedure-change": "Procedure",
  "new-item": "New",
  "removed-item": "Removed",
  "multi-change": "Multiple",
  "date-change": "Date",
  "definition-change": "Definition",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  item: DifferenceItem;
}

export default function DifferenceCard({ item }: Props) {
  const [expanded, setExpanded] = useState(true);
  const config = TYPE_CONFIG[item.type];
  const hintLabel = HINT_LABELS[item.presentationHint];

  return (
    <article
      className={`rounded-xl border border-gray-200 border-l-4 ${config.borderClass} bg-white shadow-sm overflow-hidden`}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between gap-4 px-5 py-4 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((x) => !x); }}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Type badge */}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badgeClass} shrink-0`}
          >
            <span>{config.icon}</span>
            {config.badge}
          </span>
          {/* Hint label */}
          <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">
            {hintLabel}
          </span>
          {/* Topic */}
          <h3 className="text-sm font-semibold text-gray-800 truncate">{item.topic}</h3>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* AI / deterministic badge */}
          {item.comparisonMethod === "ai-assisted" && (
            <span className="text-xs text-blue-400 hidden sm:inline">AI</span>
          )}
          {/* Confidence */}
          <span className="text-xs text-gray-300 hidden sm:inline">
            {Math.round(item.confidence * 100)}%
          </span>
          {/* Expand toggle */}
          <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
          {/* Explanation */}
          <p className="text-sm text-gray-700 leading-relaxed pt-3">{item.explanation}</p>

          {/* Before/After blocks */}
          {(item.previous || item.current) && (
            <div
              className={`grid gap-3 ${
                item.previous && item.current ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
              }`}
            >
              {item.previous && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">
                    Previous
                  </p>
                  {item.previous.value && (
                    <p className="text-sm font-bold text-red-700">{item.previous.value}</p>
                  )}
                  <p className="text-xs text-red-600 leading-relaxed">{item.previous.content}</p>
                  {item.previous.source && (
                    <p className="text-xs text-red-300 mt-1">
                      Page {item.previous.source.page}
                      {item.previous.source.section ? ` · ${item.previous.source.section}` : ""}
                    </p>
                  )}
                </div>
              )}

              {item.current && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-3 space-y-1">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                    Current
                  </p>
                  {item.current.value && (
                    <p className="text-sm font-bold text-green-700">{item.current.value}</p>
                  )}
                  <p className="text-xs text-green-700 leading-relaxed">{item.current.content}</p>
                  {item.current.source && (
                    <p className="text-xs text-green-400 mt-1">
                      Page {item.current.source.page}
                      {item.current.source.section ? ` · ${item.current.source.section}` : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
