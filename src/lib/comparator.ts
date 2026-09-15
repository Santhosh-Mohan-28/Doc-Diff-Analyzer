import type { MatchedPair, NormalizedUnit, ClassifiedItem } from "./types";
import { callStructured } from "./gemini";

// ---------------------------------------------------------------------------
// Deterministic numeric/temporal comparison
// Returns "changed", "unchanged", or null (inconclusive → needs AI)
// ---------------------------------------------------------------------------

interface DeterministicResult {
  classification: "changed" | "unchanged" | null;
  details: string[];
  confidence: number;
}

function compareNumerics(prev: NormalizedUnit, curr: NormalizedUnit): DeterministicResult {
  const details: string[] = [];
  let hasConclusion = false;
  let isChanged = false;

  // Monetary amount
  if (prev.normalizedAmount !== undefined && curr.normalizedAmount !== undefined) {
    hasConclusion = true;
    if (prev.normalizedAmount !== curr.normalizedAmount) {
      details.push(
        `Amount changed: ${prev.amountRaw ?? prev.normalizedAmount} → ${curr.amountRaw ?? curr.normalizedAmount}`
      );
      isChanged = true;
    }
  }

  // Period / unit — GUARD: per_month ≠ per_year even for same amount
  if (prev.normalizedUnit !== undefined && curr.normalizedUnit !== undefined) {
    hasConclusion = true;
    if (prev.normalizedUnit !== curr.normalizedUnit) {
      details.push(`Period changed: ${prev.normalizedUnit} → ${curr.normalizedUnit}`);
      isChanged = true;
    }
  }

  // Submission deadline
  if (prev.normalizedSubmissionDays !== undefined && curr.normalizedSubmissionDays !== undefined) {
    hasConclusion = true;
    if (prev.normalizedSubmissionDays !== curr.normalizedSubmissionDays) {
      details.push(
        `Deadline changed: ${prev.normalizedSubmissionDays} days → ${curr.normalizedSubmissionDays} days`
      );
      isChanged = true;
    }
  }

  // Percentage
  if (prev.normalizedPercentage !== undefined && curr.normalizedPercentage !== undefined) {
    hasConclusion = true;
    if (Math.abs(prev.normalizedPercentage - curr.normalizedPercentage) > 0.001) {
      details.push(
        `Percentage changed: ${prev.normalizedPercentage}% → ${curr.normalizedPercentage}%`
      );
      isChanged = true;
    }
  }

  if (!hasConclusion) return { classification: null, details: [], confidence: 0 };

  return {
    classification: isChanged ? "changed" : "unchanged",
    details,
    confidence: isChanged ? 0.95 : 0.8,
  };
}

// ---------------------------------------------------------------------------
// AI-assisted comparison — only called for genuinely ambiguous pairs
// ---------------------------------------------------------------------------

const COMPARISON_SCHEMA = {
  type: "object",
  properties: {
    classification: { type: "string", enum: ["changed", "unchanged"] },
    reason: { type: "string" },
    confidence: { type: "number" },
    changedAspects: { type: "array", items: { type: "string" } },
  },
  required: ["classification", "reason", "confidence"],
};

const COMPARISON_SYSTEM_PROMPT = `You are a semantic comparison expert for document analysis.

Two documents make statements about the same underlying concept.
Determine whether the underlying MEANING has genuinely changed.

Report UNCHANGED for:
- Wording or phrasing differences only
- Synonym substitution ("employees" vs "eligible staff")
- Formatting differences (bullet → paragraph, table → prose)
- Section or heading changes
- Reordered sentences with identical meaning
- Equivalent currency representations (₹500 = INR 500 = Rs.500)
- Equivalent percentage representations (10% = 10 percent)
- Equivalent date representations
- Different but semantically identical eligibility descriptions

Report CHANGED ONLY when there is a genuine difference in:
- Numeric values (amounts, percentages, rates, counts)
- Time periods or deadlines
- Eligibility conditions or criteria
- Requirements, obligations, or procedures
- Exceptions or restrictions added or removed
- Existence of a benefit or policy itself

IMPORTANT: If uncertain, err toward UNCHANGED. Low false positives are the priority.`;

async function aiCompare(
  prev: NormalizedUnit,
  curr: NormalizedUnit
): Promise<{ classification: "changed" | "unchanged"; reason: string; confidence: number; changedAspects?: string[] }> {
  const result = await callStructured<{
    classification: "changed" | "unchanged";
    reason: string;
    confidence: number;
    changedAspects?: string[];
  }>(
    COMPARISON_SYSTEM_PROMPT,
    `Compare these two statements about the same concept:

PREVIOUS:
Topic: ${prev.topic}
Statement: ${prev.statement}
${prev.eligibilityCondition ? `Eligibility: ${prev.eligibilityCondition}` : ""}
${prev.submissionCondition ? `Submission: ${prev.submissionCondition}` : ""}
${prev.exception ? `Exception: ${prev.exception}` : ""}
Original text: "${prev.source.originalText}"

CURRENT:
Topic: ${curr.topic}
Statement: ${curr.statement}
${curr.eligibilityCondition ? `Eligibility: ${curr.eligibilityCondition}` : ""}
${curr.submissionCondition ? `Submission: ${curr.submissionCondition}` : ""}
${curr.exception ? `Exception: ${curr.exception}` : ""}
Original text: "${curr.source.originalText}"

Do these convey the same meaning, requirements, and conditions?`,
    COMPARISON_SCHEMA
  );

  // Conservative threshold: "changed" requires ≥0.70 confidence
  if (result.classification === "changed" && result.confidence < 0.7) {
    return {
      classification: "unchanged",
      reason: `Insufficient confidence for change (${result.confidence.toFixed(2)}): ${result.reason}`,
      confidence: result.confidence,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main comparison function
// ---------------------------------------------------------------------------

export async function compareMatchedPairs(
  matched: MatchedPair[],
  unmatchedPrevious: NormalizedUnit[],
  unmatchedCurrent: NormalizedUnit[]
): Promise<ClassifiedItem[]> {
  const results: ClassifiedItem[] = [];

  // ── Matched pairs ──────────────────────────────────────────────────────────
  for (const pair of matched) {
    const det = compareNumerics(pair.previous, pair.current);

    if (det.classification === "changed") {
      // Deterministic: clearly changed
      results.push({
        type: "changed",
        matchedPair: pair,
        previousUnit: pair.previous,
        currentUnit: pair.current,
        changeDetails: det.details.join("; "),
        comparisonMethod: "deterministic",
        confidence: det.confidence,
      });
    } else if (det.classification === "unchanged" && det.confidence >= 0.9) {
      // Deterministic: clearly unchanged — skip AI call
      results.push({
        type: "unchanged",
        matchedPair: pair,
        previousUnit: pair.previous,
        currentUnit: pair.current,
        comparisonMethod: "deterministic",
        confidence: det.confidence,
      });
    } else {
      // Ambiguous — use AI
      try {
        const ai = await aiCompare(pair.previous, pair.current);
        results.push({
          type: ai.classification,
          matchedPair: pair,
          previousUnit: pair.previous,
          currentUnit: pair.current,
          changeDetails:
            ai.classification === "changed"
              ? (ai.changedAspects?.join("; ") ?? ai.reason)
              : undefined,
          comparisonMethod: "ai-assisted",
          confidence: ai.confidence,
        });
      } catch (err) {
        // On AI failure, conservatively classify as unchanged (low false positive priority)
        console.error(
          `[comparator] AI compare failed for ${pair.previous.id}/${pair.current.id}:`,
          err
        );
        results.push({
          type: "unchanged",
          matchedPair: pair,
          previousUnit: pair.previous,
          currentUnit: pair.current,
          comparisonMethod: "ai-assisted",
          confidence: 0.5,
        });
      }
    }
  }

  // ── Unmatched previous → REMOVED ──────────────────────────────────────────
  for (const unit of unmatchedPrevious) {
    results.push({
      type: "removed",
      previousUnit: unit,
      comparisonMethod: "deterministic",
      confidence: 0.8,
    });
  }

  // ── Unmatched current → NEW ────────────────────────────────────────────────
  for (const unit of unmatchedCurrent) {
    results.push({
      type: "new",
      currentUnit: unit,
      comparisonMethod: "deterministic",
      confidence: 0.8,
    });
  }

  return results;
}
