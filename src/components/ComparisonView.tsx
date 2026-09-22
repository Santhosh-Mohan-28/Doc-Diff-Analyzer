"use client";

import { useMemo, useState } from "react";
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

const TOPIC_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "information",
  "details",
  "detail",
  "data",
]);

function normalizeSearchText(value?: string) {
  return (
    value
      ?.toLowerCase()
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

// ---------------------------------------------------------------------------
// Generic topic normalization
//
// Topics are broad categories. They should not be treated as exact strings.
//
// Examples:
//   Project       -> project
//   Projects      -> project
//   Internship    -> internship
//   Internship Duration -> internship duration
//   Personal Information -> personal
//   Personal Summary     -> personal
//
// This is deliberately separate from `subject`.
// The subject identifies the individual card; the topic identifies the
// broader section containing related cards.
// ---------------------------------------------------------------------------

function normalizeTopicWords(topic?: string): string[] {
  const normalized = normalizeSearchText(topic)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter(
      (word) =>
        word.length > 1 &&
        !TOPIC_STOP_WORDS.has(word)
    )
    .map(singularizeTopicWord);
}

function singularizeTopicWord(word: string): string {
  if (word.length <= 3) {
    return word;
  }

  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }

  if (
    word.endsWith("ses") &&
    word.length > 4
  ) {
    return word.slice(0, -2);
  }

  if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !word.endsWith("us")
  ) {
    return word.slice(0, -1);
  }

  return word;
}

function getTopicKey(topic?: string): string {
  return normalizeTopicWords(topic).join(" ");
}

function getTopicTokens(topic?: string): Set<string> {
  return new Set(normalizeTopicWords(topic));
}

// ---------------------------------------------------------------------------
// Determine whether two topics belong to the same broad topic family.
//
// This is intentionally generic:
//
// 1. Exact normalized topic.
// 2. One topic completely contains the other.
// 3. Topics share the same leading semantic word.
//
// The last rule handles cases such as:
//   Personal Information
//   Personal Summary
//
// without requiring hard-coded topic names.
// ---------------------------------------------------------------------------

function topicsBelongTogether(
  first?: string,
  second?: string
): boolean {
  const firstTokens = getTopicTokens(first);
  const secondTokens = getTopicTokens(second);

  if (
    firstTokens.size === 0 ||
    secondTokens.size === 0
  ) {
    return false;
  }

  if (
    firstTokens.size === secondTokens.size &&
    [...firstTokens].every((word) =>
      secondTokens.has(word)
    )
  ) {
    return true;
  }

  const firstSubsetOfSecond = [...firstTokens].every(
    (word) => secondTokens.has(word)
  );

  const secondSubsetOfFirst = [...secondTokens].every(
    (word) => firstTokens.has(word)
  );

  if (
    firstSubsetOfSecond ||
    secondSubsetOfFirst
  ) {
    return true;
  }

  const firstLeadingWord =
    normalizeTopicWords(first)[0];

  const secondLeadingWord =
    normalizeTopicWords(second)[0];

  if (
    firstLeadingWord &&
    secondLeadingWord &&
    firstLeadingWord === secondLeadingWord
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Topic family grouping
// ---------------------------------------------------------------------------

interface TopicFamily {
  key: string;
  label: string;
  topics: string[];
}

function chooseTopicLabel(
  topics: string[]
): string {
  if (topics.length === 0) {
    return "Other";
  }

  /*
   * Prefer the shortest meaningful topic.
   *
   * Example:
   *   Internship
   *   Internship Duration
   *
   * becomes:
   *   Internship
   *
   * But if there is only one topic, its original wording is preserved.
   */
  return [...topics].sort((a, b) => {
    const aWords = normalizeTopicWords(a).length;
    const bWords = normalizeTopicWords(b).length;

    if (aWords !== bWords) {
      return aWords - bWords;
    }

    return a.localeCompare(b);
  })[0];
}

function buildTopicFamilies(
  items: DifferenceItem[]
): Map<string, string> {
  const uniqueTopics = Array.from(
    new Set(
      items.map(
        (item) =>
          item.topic?.trim() || "Other"
      )
    )
  );

  const parent = new Map<string, string>();

  for (const topic of uniqueTopics) {
    parent.set(topic, topic);
  }

  function find(topic: string): string {
    let root = topic;

    while (
      parent.get(root) &&
      parent.get(root) !== root
    ) {
      root = parent.get(root)!;
    }

    let current = topic;

    while (
      parent.get(current) &&
      parent.get(current) !== current
    ) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }

    return root;
  }

  function union(
    first: string,
    second: string
  ) {
    const firstRoot = find(first);
    const secondRoot = find(second);

    if (firstRoot !== secondRoot) {
      parent.set(
        secondRoot,
        firstRoot
      );
    }
  }

  for (
    let i = 0;
    i < uniqueTopics.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < uniqueTopics.length;
      j++
    ) {
      const first =
        uniqueTopics[i];

      const second =
        uniqueTopics[j];

      if (
        topicsBelongTogether(
          first,
          second
        )
      ) {
        union(first, second);
      }
    }
  }

  const groupedTopics = new Map<
    string,
    string[]
  >();

  for (const topic of uniqueTopics) {
    const root = find(topic);

    const topics =
      groupedTopics.get(root) ?? [];

    topics.push(topic);
    groupedTopics.set(root, topics);
  }

  const topicToFamily =
    new Map<string, string>();

  for (const topics of groupedTopics.values()) {
    const label =
      chooseTopicLabel(topics);

    for (const topic of topics) {
      topicToFamily.set(
        topic,
        label
      );
    }
  }

  return topicToFamily;
}

// ---------------------------------------------------------------------------
// Searchable content
// ---------------------------------------------------------------------------

function getSearchableText(
  item: DifferenceItem
) {
  return [
    item.topic,
    item.subject,
    item.previous?.value,
    item.current?.value,
    item.explanation,
  ]
    .map(normalizeSearchText)
    .join(" ");
}

export default function ComparisonView({
  differences,
}: Props) {
  const [filter, setFilter] =
    useState<FilterType>("all");

  const [search, setSearch] =
    useState("");

  const [collapsedTopics, setCollapsedTopics] =
    useState<Record<string, boolean>>({});

  // Only meaningful differences are shown in the report.
  const meaningfulDifferences =
    differences.filter(
      (d) =>
        d.type === "changed" ||
        d.type === "new" ||
        d.type === "removed"
    );

  const counts: Record<
    FilterType,
    number
  > = {
    all: meaningfulDifferences.length,
    changed:
      meaningfulDifferences.filter(
        (d) => d.type === "changed"
      ).length,
    new:
      meaningfulDifferences.filter(
        (d) => d.type === "new"
      ).length,
    removed:
      meaningfulDifferences.filter(
        (d) => d.type === "removed"
      ).length,
  };

  const filteredByType =
    filter === "all"
      ? meaningfulDifferences
      : meaningfulDifferences.filter(
          (d) => d.type === filter
        );

  const visible = useMemo(() => {
    const query =
      normalizeSearchText(search);

    if (!query) {
      return filteredByType;
    }

    return filteredByType.filter(
      (item) =>
        getSearchableText(item).includes(
          query
        )
    );
  }, [filteredByType, search]);

  // Build semantic topic families from the currently visible results.
  const groupedByTopic = useMemo(() => {
    const topicFamilies =
      buildTopicFamilies(visible);

    const groups = new Map<
      string,
      DifferenceItem[]
    >();

    visible.forEach((item) => {
      const rawTopic =
        item.topic?.trim() ||
        "Other";

      const family =
        topicFamilies.get(
          rawTopic
        ) ?? rawTopic;

      if (!groups.has(family)) {
        groups.set(family, []);
      }

      groups
        .get(family)!
        .push(item);
    });

    return Array.from(
      groups.entries()
    ).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [visible]);

  const toggleTopic = (
    topic: string
  ) => {
    setCollapsedTopics(
      (previous) => ({
        ...previous,
        [topic]:
          !previous[topic],
      })
    );
  };

  if (
    meaningfulDifferences.length === 0
  ) {
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
            The documents appear to convey
            the same information. Formatting,
            wording, synonyms, and reordered
            content were intentionally excluded.
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
            Review each detected change with its
            supporting document evidence.
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

      {/* Search */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        >
          <circle
            cx="11"
            cy="11"
            r="7"
          />
          <path
            strokeLinecap="round"
            d="m16.5 16.5 4 4"
          />
        </svg>

        <input
          type="text"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Search differences..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
        />

        {search && (
          <button
            type="button"
            onClick={() =>
              setSearch("")
            }
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                d="M6 6l12 12M18 6 6 18"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="sticky top-4 z-10 rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-sm backdrop-blur-xl">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
          {(
            Object.keys(
              FILTER_LABELS
            ) as FilterType[]
          ).map((f) => {
            const active =
              filter === f;

            return (
              <button
                key={f}
                type="button"
                onClick={() =>
                  setFilter(f)
                }
                className={`
                  inline-flex shrink-0 items-center gap-2 rounded-xl border
                  px-3.5 py-2 text-xs font-semibold
                  transition-all duration-200
                  ${
                    active
                      ? FILTER_STYLES[f]
                          .active
                      : "border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                  }
                `}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active
                      ? FILTER_STYLES[f]
                          .dot
                      : f === "changed"
                        ? "bg-amber-400"
                        : f === "new"
                          ? "bg-emerald-500"
                          : f === "removed"
                            ? "bg-red-500"
                            : "bg-slate-400"
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

      {/* Search result state */}
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
              <circle
                cx="11"
                cy="11"
                r="7"
              />
              <path
                strokeLinecap="round"
                d="m16.5 16.5 4 4"
              />
            </svg>
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-700">
            No differences found
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Try a different search term or
            filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByTopic.map(
            ([topic, items]) => {
              const isCollapsed =
                collapsedTopics[
                  topic
                ] ?? false;

              return (
                <div
                  key={topic}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  {/* Topic header */}
                  <button
                    type="button"
                    onClick={() =>
                      toggleTopic(
                        topic
                      )
                    }
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          className="h-4 w-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 6.5A2.5 2.5 0 0 1 6.5 4H10l2 2h5.5A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11Z"
                          />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
                          {topic}
                        </h3>

                        <p className="mt-0.5 text-xs text-slate-400">
                          {items.length}{" "}
                          {items.length ===
                          1
                            ? "difference"
                            : "differences"}
                        </p>
                      </div>
                    </div>

                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        isCollapsed
                          ? ""
                          : "rotate-180"
                      }`}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m6 9 6 6 6-6"
                      />
                    </svg>
                  </button>

                  {/* Topic cards */}
                  {!isCollapsed && (
                    <div className="border-t border-slate-100 p-4 sm:p-5">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.map(
                          (
                            item,
                            index
                          ) => (
                            <div
                              key={
                                item.id
                              }
                              className="animate-fade-up h-full"
                              style={{
                                animationDelay: `${Math.min(
                                  index *
                                    45,
                                  400
                                )}ms`,
                              }}
                            >
                              <DifferenceCard
                                item={
                                  item
                                }
                              />
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
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