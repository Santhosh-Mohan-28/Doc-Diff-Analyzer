import type { NormalizedUnit, MatchedPair, MatchResult } from "./types";
import { callStructured } from "./gemini";

// ---------------------------------------------------------------------------
// Affinity scoring helpers — recall-focused; low score ≠ excluded
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "must", "per", "that", "this",
  "it", "its", "as", "if", "all", "any", "each", "employee", "employees",
  "eligible", "staff", "member", "members", "policy", "document",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const inter = new Set(Array.from(a).filter((x) => b.has(x)));
  const union = new Set([...Array.from(a), ...Array.from(b)]);
  return inter.size / union.size;
}

/**
 * Soft affinity score (0–1) between a previous and current proposition.
 * This is ONLY used to sort and prioritise candidates for Gemini evaluation.
 * A score of 0 does NOT mean the pair is excluded — it still reaches Gemini
 * if no other partner has been found for that unit.
 */
function computeAffinity(prev: NormalizedUnit, curr: NormalizedUnit): number {
  let score = 0;
  score += jaccard(tokenize(prev.topic), tokenize(curr.topic)) * 0.4;
  score += jaccard(tokenize(prev.statement), tokenize(curr.statement)) * 0.35;
  if (
    prev.normalizedAmount !== undefined &&
    curr.normalizedAmount !== undefined &&
    prev.normalizedAmount === curr.normalizedAmount
  ) score += 0.15;
  if (
    prev.normalizedUnit !== undefined &&
    curr.normalizedUnit !== undefined &&
    prev.normalizedUnit === curr.normalizedUnit
  ) score += 0.1;
  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Candidate generation
//
// ARCHITECTURAL RULE (approved, verbatim):
//   "Topic-keyword pre-grouping MUST ONLY be used as a soft candidate-generation
//    optimization. It must NEVER permanently exclude two propositions from
//    semantic matching solely because their topic keywords differ."
//
// Implementation guarantee:
//   - Every previous unit appears in ≥1 candidate pair sent to Gemini.
//   - Every current unit appears in ≥1 candidate pair sent to Gemini.
//   - Affinity only controls ordering (highest-affinity pairs evaluated first).
// ---------------------------------------------------------------------------

interface CandidatePair {
  prev: NormalizedUnit;
  curr: NormalizedUnit;
  affinity: number;
}

function generateCandidates(
  previous: NormalizedUnit[],
  current: NormalizedUnit[]
): CandidatePair[] {
  if (previous.length === 0 || current.length === 0) return [];

  // All-pairs affinity matrix, sorted descending
  const all: CandidatePair[] = [];
  for (const p of previous) {
    for (const c of current) {
      all.push({ prev: p, curr: c, affinity: computeAffinity(p, c) });
    }
  }
  all.sort((a, b) => b.affinity - a.affinity);

  // Greedily include pairs; ensure every unit gets ≥1 candidate
  const prevCovered = new Set<string>();
  const currCovered = new Set<string>();
  const candidates: CandidatePair[] = [];

  for (const pair of all) {
    const prevDone = prevCovered.has(pair.prev.id);
    const currDone = currCovered.has(pair.curr.id);

    // Include if either unit still needs a candidate, or if affinity is high enough
    const needsCoverage = !prevDone || !currDone;
    const highAffinity = pair.affinity >= 0.15;

    if (needsCoverage || highAffinity) {
      candidates.push(pair);
      prevCovered.add(pair.prev.id);
      currCovered.add(pair.curr.id);
    }

    // Stop growing the set once it is unreasonably large
    if (candidates.length >= previous.length * current.length) break;
  }

  // Safety net: guarantee no unit was accidentally skipped
  for (const p of previous) {
    if (!prevCovered.has(p.id)) {
      candidates.push({ prev: p, curr: current[0], affinity: 0 });
    }
  }
  for (const c of current) {
    if (!currCovered.has(c.id)) {
      candidates.push({ prev: previous[0], curr: c, affinity: 0 });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Gemini matching — batch size
// ---------------------------------------------------------------------------

const MATCH_BATCH_SIZE = 25;

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          previousId: { type: "string" },
          currentId: { type: "string" },
          confidence: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["previousId", "currentId", "confidence", "rationale"],
      },
    },
  },
  required: ["matches"],
};

const MATCH_SYSTEM_PROMPT = `You are a semantic matching expert for document comparison.

Given candidate pairs from a Previous document (A) and a Current document (B),
determine which pairs represent the SAME underlying concept, policy, rule, or fact.

MATCHING RULES:
1. Two propositions MATCH if they describe the same real-world concept, even with completely different terminology or phrasing.
2. Different words, synonyms, or section placement do NOT prevent a match.
3. "Medical Reimbursement" and "Healthcare Expense Benefit" may be the SAME concept — evaluate meaning, not labels.
4. Different formatting (table vs paragraph) does NOT prevent a match.
5. Only return matches with confidence >= 0.55.
6. Each proposition should match at most one other (pick the best if multiple qualify).
7. Do NOT match propositions that discuss fundamentally different subjects.

Return only the pairs that ARE a match with confidence and brief rationale.`;

// ---------------------------------------------------------------------------
// Safety net — checks whether an unmatched unit's concept appears anywhere
// in the other document (prevents spurious REMOVED/NEW reports)
// ---------------------------------------------------------------------------

const PRESENCE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["found", "confidence", "reason"],
};

async function checkConceptPresence(
  unit: NormalizedUnit,
  others: NormalizedUnit[]
): Promise<boolean> {
  if (others.length === 0) return false;

  const otherList = others
    .map((u) => `[${u.id}] ${u.topic}: ${u.statement}`)
    .join("\n");

  try {
    const result = await callStructured<{ found: boolean; confidence: number }>(
      `You check whether a concept from one document appears anywhere in another document's proposition list.
Be generous: if ANY proposition covers the same topic or concept (even if worded very differently), return found: true.
Return found: false ONLY if you are confident the concept is genuinely absent from the entire other document.`,
      `Proposition to find:
Topic: ${unit.topic}
Statement: ${unit.statement}

Other document propositions:
${otherList}

Does the other document contain ANY proposition referring to the same underlying concept?`,
      PRESENCE_SCHEMA
    );
    return result.found && result.confidence >= 0.6;
  } catch {
    // Conservative fallback: assume concept might be present to avoid false positives
    return true;
  }
}

// ---------------------------------------------------------------------------
// Main match function
// ---------------------------------------------------------------------------

export async function matchPropositions(
  previous: NormalizedUnit[],
  current: NormalizedUnit[]
): Promise<MatchResult> {
  if (!previous.length && !current.length)
    return { matched: [], unmatchedPrevious: [], unmatchedCurrent: [] };
  if (!previous.length)
    return { matched: [], unmatchedPrevious: [], unmatchedCurrent: current };
  if (!current.length)
    return { matched: [], unmatchedPrevious: previous, unmatchedCurrent: [] };

  // Step 1: recall-focused candidate generation
  const candidates = generateCandidates(previous, current);

  // Step 2: Gemini semantic matching in batches
  const confirmed: MatchedPair[] = [];
  const matchedPrev = new Set<string>();
  const matchedCurr = new Set<string>();
  const prevMap = new Map(previous.map((p) => [p.id, p]));
  const currMap = new Map(current.map((c) => [c.id, c]));

  for (let i = 0; i < candidates.length; i += MATCH_BATCH_SIZE) {
    const batch = candidates
      .slice(i, i + MATCH_BATCH_SIZE)
      .filter((p) => !matchedPrev.has(p.prev.id) && !matchedCurr.has(p.curr.id));

    if (!batch.length) continue;

    const pairDescriptions = batch
      .map(
        (pair, idx) =>
          `Pair ${idx + 1}:\n  Previous [${pair.prev.id}]: ${pair.prev.topic} — ${pair.prev.statement}\n  Current  [${pair.curr.id}]: ${pair.curr.topic} — ${pair.curr.statement}`
      )
      .join("\n\n");

    try {
      const result = await callStructured<{
        matches: Array<{
          previousId: string;
          currentId: string;
          confidence: number;
          rationale: string;
        }>;
      }>(
        MATCH_SYSTEM_PROMPT,
        `Evaluate these candidate pairs — identify which represent the same underlying concept:\n\n${pairDescriptions}`,
        MATCH_SCHEMA
      );

      for (const m of result.matches ?? []) {
        const prev = prevMap.get(m.previousId);
        const curr = currMap.get(m.currentId);
        if (!prev || !curr) continue;
        if (m.confidence < 0.55) continue;
        if (matchedPrev.has(prev.id) || matchedCurr.has(curr.id)) continue;

        confirmed.push({
          previous: prev,
          current: curr,
          matchConfidence: m.confidence,
          matchRationale: m.rationale,
        });
        matchedPrev.add(prev.id);
        matchedCurr.add(curr.id);
      }
    } catch (err) {
      console.error(`[matcher] Batch ${Math.floor(i / MATCH_BATCH_SIZE) + 1} failed:`, err);
    }
  }

  // Step 3: Safety net on unmatched units — verify concept truly absent
  const tentPrev = previous.filter((p) => !matchedPrev.has(p.id));
  const tentCurr = current.filter((c) => !matchedCurr.has(c.id));

  const trulyUnmatchedPrev: NormalizedUnit[] = [];
  for (const p of tentPrev) {
    const found = await checkConceptPresence(p, current);
    if (!found) trulyUnmatchedPrev.push(p);
  }

  const trulyUnmatchedCurr: NormalizedUnit[] = [];
  for (const c of tentCurr) {
    const found = await checkConceptPresence(c, previous);
    if (!found) trulyUnmatchedCurr.push(c);
  }

  return {
    matched: confirmed,
    unmatchedPrevious: trulyUnmatchedPrev,
    unmatchedCurrent: trulyUnmatchedCurr,
  };
}

