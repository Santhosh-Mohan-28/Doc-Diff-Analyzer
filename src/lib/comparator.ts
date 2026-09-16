import type {
  MatchedPair,
  NormalizedUnit,
  ClassifiedItem,
} from "./types";
import { callStructured } from "./gemini";

// ---------------------------------------------------------------------------
// Deterministic numeric/temporal comparison
//
// Returns:
//   "changed"   -> deterministic evidence proves a change
//   "unchanged" -> deterministic evidence proves equivalence
//   null        -> not enough deterministic information; use AI
// ---------------------------------------------------------------------------

interface DeterministicResult {
  classification:
    | "changed"
    | "unchanged"
    | null;
  details: string[];
  confidence: number;
}

function compareNumerics(
  prev: NormalizedUnit,
  curr: NormalizedUnit
): DeterministicResult {
  const details: string[] = [];

  let hasConclusion = false;
  let isChanged = false;

  // -------------------------------------------------------------------------
  // Monetary amount
  // -------------------------------------------------------------------------

  if (
    prev.normalizedAmount !==
      undefined &&
    curr.normalizedAmount !==
      undefined
  ) {
    hasConclusion = true;

    if (
      prev.normalizedAmount !==
      curr.normalizedAmount
    ) {
      details.push(
        `Amount changed: ${
          prev.amountRaw ??
          prev.normalizedAmount
        } → ${
          curr.amountRaw ??
          curr.normalizedAmount
        }`
      );

      isChanged = true;
    }
  }

  // -------------------------------------------------------------------------
  // Period / unit
  //
  // Example:
  //   ₹10,000 per month
  //   ₹10,000 per year
  //
  // Same amount, different period = CHANGED.
  // -------------------------------------------------------------------------

  if (
    prev.normalizedUnit !==
      undefined &&
    curr.normalizedUnit !==
      undefined
  ) {
    hasConclusion = true;

    if (
      prev.normalizedUnit !==
      curr.normalizedUnit
    ) {
      details.push(
        `Period changed: ${prev.normalizedUnit} → ${curr.normalizedUnit}`
      );

      isChanged = true;
    }
  }

  // -------------------------------------------------------------------------
  // Submission deadline
  // -------------------------------------------------------------------------

  if (
    prev.normalizedSubmissionDays !==
      undefined &&
    curr.normalizedSubmissionDays !==
      undefined
  ) {
    hasConclusion = true;

    if (
      prev.normalizedSubmissionDays !==
      curr.normalizedSubmissionDays
    ) {
      details.push(
        `Deadline changed: ${prev.normalizedSubmissionDays} days → ${curr.normalizedSubmissionDays} days`
      );

      isChanged = true;
    }
  }

  // -------------------------------------------------------------------------
  // Percentage
  // -------------------------------------------------------------------------

  if (
    prev.normalizedPercentage !==
      undefined &&
    curr.normalizedPercentage !==
      undefined
  ) {
    hasConclusion = true;

    if (
      Math.abs(
        prev.normalizedPercentage -
          curr.normalizedPercentage
      ) > 0.001
    ) {
      details.push(
        `Percentage changed: ${prev.normalizedPercentage}% → ${curr.normalizedPercentage}%`
      );

      isChanged = true;
    }
  }

  // No deterministic comparison was possible.
  if (!hasConclusion) {
    return {
      classification: null,
      details: [],
      confidence: 0,
    };
  }

  return {
    classification: isChanged
      ? "changed"
      : "unchanged",
    details,
    confidence: isChanged
      ? 0.95
      : 0.8,
  };
}

// ---------------------------------------------------------------------------
// AI-assisted semantic comparison
//
// This is only used when deterministic comparison cannot establish the
// result with high confidence.
// ---------------------------------------------------------------------------

const COMPARISON_SCHEMA = {
  type: "object",
  properties: {
    classification: {
      type: "string",
      enum: [
        "changed",
        "unchanged",
      ],
    },

    reason: {
      type: "string",
    },

    confidence: {
      type: "number",
    },

    changedAspects: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },

  required: [
    "classification",
    "reason",
    "confidence",
  ],
};

const COMPARISON_SYSTEM_PROMPT = `You are a semantic comparison expert for document analysis.

Two propositions have already been determined to refer to the SAME underlying semantic subject.

Your job is now to determine whether the CONTENT or MEANING associated with that subject has genuinely changed.

IMPORTANT:

A matched proposition can have completely different values and still represent a genuine CHANGE.

Examples:

Previous:
Subject: name
Statement: Rahul Kumar

Current:
Subject: name
Statement: Santhosh Mohan

=> CHANGED

The semantic subject is the same, but the value changed.

---

Previous:
Subject: school
Statement: ABC Engineering College

Current:
Subject: school
Statement: Easwari Engineering College

=> CHANGED

---

Previous:
Subject: employer
Statement: Google

Current:
Subject: employer
Statement: Microsoft

=> CHANGED

---

Previous:
Subject: email
Statement: rahul@example.com

Current:
Subject: email
Statement: santhosh@example.com

=> CHANGED

---

Previous:
Subject: interest rate
Statement: 8.5%

Current:
Subject: interest rate
Statement: 9%

=> CHANGED

The field is the same, but the value changed.

Therefore:

SAME SUBJECT + DIFFERENT VALUE can be a genuine CHANGE.

Do NOT classify a changed value as UNCHANGED merely because the semantic subject is the same.

Report UNCHANGED when the two propositions communicate the same underlying meaning and value, including:

- wording differences only
- synonym substitution
- formatting differences
- bullet → paragraph
- paragraph → table
- table → prose
- section or heading changes
- reordered sentences with identical meaning
- equivalent currency representations
- equivalent percentage representations
- equivalent date representations
- equivalent numerical formatting
- equivalent eligibility descriptions
- equivalent requirements or conditions
- paragraph splitting or merging

Report CHANGED when there is a genuine difference in:

- names
- organizations
- schools
- companies
- email addresses
- phone numbers
- locations
- numeric values
- amounts
- percentages
- rates
- counts
- time periods
- deadlines
- eligibility conditions
- requirements
- obligations
- procedures
- exceptions
- restrictions
- benefits
- policy rules
- other substantive values or meanings

IMPORTANT:

Do not treat mere wording differences as changes.

Do not treat a moved proposition as a change.

Do not treat formatting changes as changes.

Do not treat equivalent representations as changes.

Compare the semantic content, not the surface wording.

If the subject is the same but its actual value has changed, report CHANGED.

If the subject and its meaning/value are effectively equivalent, report UNCHANGED.

If uncertain, prefer UNCHANGED only when there is genuinely insufficient evidence of a substantive change.

Provide a concise reason and list the substantive changed aspects when classification is CHANGED.`;

async function aiCompare(
  prev: NormalizedUnit,
  curr: NormalizedUnit
): Promise<{
  classification:
    | "changed"
    | "unchanged";
  reason: string;
  confidence: number;
  changedAspects?: string[];
}> {
  const result =
    await callStructured<{
      classification:
        | "changed"
        | "unchanged";

      reason: string;

      confidence: number;

      changedAspects?: string[];
    }>(
      COMPARISON_SYSTEM_PROMPT,

      `Compare these two propositions.

They have already been matched as referring to the same underlying semantic subject.

PREVIOUS:
Subject: ${prev.subject ?? ""}
Topic: ${prev.topic}
Statement: ${prev.statement}
${
  prev.eligibilityCondition
    ? `Eligibility: ${prev.eligibilityCondition}`
    : ""
}
${
  prev.submissionCondition
    ? `Submission: ${prev.submissionCondition}`
    : ""
}
${
  prev.exception
    ? `Exception: ${prev.exception}`
    : ""
}
Original text: "${prev.source.originalText}"

CURRENT:
Subject: ${curr.subject ?? ""}
Topic: ${curr.topic}
Statement: ${curr.statement}
${
  curr.eligibilityCondition
    ? `Eligibility: ${curr.eligibilityCondition}`
    : ""
}
${
  curr.submissionCondition
    ? `Submission: ${curr.submissionCondition}`
    : ""
}
${
  curr.exception
    ? `Exception: ${curr.exception}`
    : ""
}
Original text: "${curr.source.originalText}"

Determine whether the actual information associated with this semantic subject has changed.

Remember:

SAME SUBJECT + DIFFERENT VALUE = CHANGED when the value itself is substantively different.

Examples:

Name: Rahul
vs
Name: Santhosh
= CHANGED

School: ABC College
vs
School: XYZ College
= CHANGED

Company: Google
vs
Company: Microsoft
= CHANGED

Interest Rate: 8.5%
vs
Interest Rate: 9%
= CHANGED

But:

"Employees must submit the form within 30 days."

vs

"Staff members are required to submit the form within thirty days."

= UNCHANGED because the meaning is equivalent.`,

      COMPARISON_SCHEMA
    );

  // -------------------------------------------------------------------------
  // Conservative threshold
  //
  // We require reasonably strong confidence before exposing a CHANGED result.
  // -------------------------------------------------------------------------

  if (
    result.classification ===
      "changed" &&
    result.confidence < 0.7
  ) {
    return {
      classification: "unchanged",
      reason: `Insufficient confidence for change (${result.confidence.toFixed(
        2
      )}): ${result.reason}`,
      confidence:
        result.confidence,
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
  const results: ClassifiedItem[] =
    [];

  // -------------------------------------------------------------------------
  // Matched pairs
  // -------------------------------------------------------------------------

  for (const pair of matched) {
    const det =
      compareNumerics(
        pair.previous,
        pair.current
      );

    // -----------------------------------------------------------------------
    // Deterministically changed
    // -----------------------------------------------------------------------

    if (
      det.classification ===
      "changed"
    ) {
      results.push({
        type: "changed",
        matchedPair: pair,
        previousUnit:
          pair.previous,
        currentUnit:
          pair.current,
        changeDetails:
          det.details.join("; "),
        comparisonMethod:
          "deterministic",
        confidence:
          det.confidence,
      });

      continue;
    }

    // -----------------------------------------------------------------------
    // Deterministically unchanged
    //
    // Only skip AI when confidence is high enough.
    // -----------------------------------------------------------------------

    if (
      det.classification ===
        "unchanged" &&
      det.confidence >= 0.9
    ) {
      results.push({
        type: "unchanged",
        matchedPair: pair,
        previousUnit:
          pair.previous,
        currentUnit:
          pair.current,
        comparisonMethod:
          "deterministic",
        confidence:
          det.confidence,
      });

      continue;
    }

    // -----------------------------------------------------------------------
    // Ambiguous pair → AI
    // -----------------------------------------------------------------------

    const ai =
      await aiCompare(
        pair.previous,
        pair.current
      );

    results.push({
      type: ai.classification,
      matchedPair: pair,
      previousUnit:
        pair.previous,
      currentUnit:
        pair.current,

      changeDetails:
        ai.classification ===
        "changed"
          ? (
              ai.changedAspects ??
              []
            ).length > 0
            ? ai.changedAspects!.join(
                "; "
              )
            : ai.reason
          : undefined,

      comparisonMethod:
        "ai-assisted",

      confidence:
        ai.confidence,
    });
  }

  // -------------------------------------------------------------------------
  // Unmatched previous → REMOVED
  //
  // The matcher found no corresponding proposition in the current document.
  // -------------------------------------------------------------------------

  for (const unit of unmatchedPrevious) {
    results.push({
      type: "removed",
      previousUnit: unit,
      comparisonMethod:
        "deterministic",
      confidence: 0.8,
    });
  }

  // -------------------------------------------------------------------------
  // Unmatched current → NEW
  //
  // The matcher found no corresponding proposition in the previous document.
  // -------------------------------------------------------------------------

  for (const unit of unmatchedCurrent) {
    results.push({
      type: "new",
      currentUnit: unit,
      comparisonMethod:
        "deterministic",
      confidence: 0.8,
    });
  }

  return results;
}