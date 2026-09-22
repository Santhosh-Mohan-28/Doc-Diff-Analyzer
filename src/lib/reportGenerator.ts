import type {
  ValidatedDifferenceItem,
  DifferenceItem,
  PresentationHint,
  NormalizedUnit,
} from "./types";
import { callStructured } from "./gemini";

// ---------------------------------------------------------------------------
// Determine presentation hint from item characteristics
// ---------------------------------------------------------------------------

function determinePresentationHint(
  item: ValidatedDifferenceItem
): PresentationHint {
  if (item.type === "new") return "new-item";
  if (item.type === "removed") return "removed-item";

  const prev = item.previousUnit;
  const curr = item.currentUnit;

  // Numeric value changed
  if (
    prev?.normalizedAmount !== undefined &&
    curr?.normalizedAmount !== undefined &&
    prev.normalizedAmount !== curr.normalizedAmount
  ) {
    return "value-change";
  }

  if (
    prev?.normalizedPercentage !== undefined &&
    curr?.normalizedPercentage !== undefined &&
    Math.abs(prev.normalizedPercentage - curr.normalizedPercentage) > 0.001
  ) {
    return "value-change";
  }

  // Deadline changed
  if (
    prev?.normalizedSubmissionDays !== undefined &&
    curr?.normalizedSubmissionDays !== undefined &&
    prev.normalizedSubmissionDays !== curr.normalizedSubmissionDays
  ) {
    return "condition-change";
  }

  // Effective date
  if (
    prev?.effectiveDate &&
    curr?.effectiveDate &&
    prev.effectiveDate !== curr.effectiveDate
  ) {
    return "date-change";
  }

  // Eligibility condition
  if (
    prev?.eligibilityCondition !== curr?.eligibilityCondition &&
    (prev?.eligibilityCondition || curr?.eligibilityCondition)
  ) {
    return "condition-change";
  }

  // Procedure
  if (prev?.procedure || curr?.procedure) {
    return "procedure-change";
  }

  // Definition
  if (prev?.definition || curr?.definition) {
    return "definition-change";
  }

  // Multiple fields changed
  const changedFields = [
    prev?.amount !== curr?.amount,
    prev?.unit !== curr?.unit,
    prev?.submissionCondition !== curr?.submissionCondition,
    prev?.exception !== curr?.exception,
  ].filter(Boolean).length;

  if (changedFields >= 2) {
    return "multi-change";
  }

  return "policy-change";
}

// ---------------------------------------------------------------------------
// Format a NormalizedUnit into readable content text
// ---------------------------------------------------------------------------

function formatContent(unit: NormalizedUnit): string {
  const parts: string[] = [unit.statement];

  if (unit.eligibilityCondition) {
    parts.push(`Eligibility: ${unit.eligibilityCondition}`);
  }

  if (unit.submissionCondition) {
    parts.push(`Submission: ${unit.submissionCondition}`);
  }

  if (unit.exception) {
    parts.push(`Exception: ${unit.exception}`);
  }

  if (unit.procedure) {
    parts.push(`Procedure: ${unit.procedure}`);
  }

  return parts.join(". ");
}

// ---------------------------------------------------------------------------
// Get stable semantic subject
//
// The subject represents the specific information being compared.
// Examples:
//   topic   = "Contact Information"
//   subject = "Phone Number"
//
//   topic   = "Internship"
//   subject = "Internship Duration"
// ---------------------------------------------------------------------------

function getSubject(item: ValidatedDifferenceItem): string {
  return (
    item.currentUnit?.subject?.trim() ||
    item.previousUnit?.subject?.trim() ||
    item.currentUnit?.topic?.trim() ||
    item.previousUnit?.topic?.trim() ||
    "Unknown"
  );
}

// ---------------------------------------------------------------------------
// AI explanation generation
// ---------------------------------------------------------------------------

const REPORT_SYSTEM_PROMPT = `You are a professional document change analyst.
Write a clear, concise explanation of a meaningful difference between two document versions.

RULES:
1. Only describe what the provided evidence supports — no speculation.
2. Be specific: for value changes state the old and new values explicitly.
3. For new items: explain what new information was introduced.
4. For removed items: explain what is no longer present.
5. For changed items: explain what specifically changed and why it matters.
6. Use professional business language appropriate for HR/legal/policy documents.
7. Maximum 2–3 sentences. Be direct.`;

const EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
  },
  required: ["explanation"],
};

async function generateExplanation(
  item: ValidatedDifferenceItem
): Promise<string> {
  let prompt: string;

  if (item.type === "new") {
    prompt = `New information introduced in the current document:

Topic: ${item.currentUnit?.topic}
Subject: ${item.currentUnit?.subject ?? "(not specified)"}
Content: ${item.currentUnit?.statement}
Original text: "${item.currentUnit?.source.originalText}"

Write a concise explanation of what new information was introduced.`;
  } else if (item.type === "removed") {
    prompt = `Information from the previous document is absent from the current document:

Topic: ${item.previousUnit?.topic}
Subject: ${item.previousUnit?.subject ?? "(not specified)"}
Content: ${item.previousUnit?.statement}
Original text: "${item.previousUnit?.source.originalText}"

Write a concise explanation of what information was removed.`;
  } else {
    prompt = `A meaningful change was detected in the following information:

Topic: ${item.previousUnit?.topic ?? item.currentUnit?.topic}
Subject: ${getSubject(item)}

PREVIOUS VERSION:
${formatContent(item.previousUnit!)}
Original text: "${item.previousUnit?.source.originalText}"

CURRENT VERSION:
${formatContent(item.currentUnit!)}
Original text: "${item.currentUnit?.source.originalText}"

Specific change: ${item.changeDetails ?? "(see content above)"}

Write a clear explanation of what changed.`;
  }

  try {
    const result = await callStructured<{ explanation: string }>(
      REPORT_SYSTEM_PROMPT,
      prompt,
      EXPLANATION_SCHEMA
    );

    return result.explanation?.trim() || generateFallbackExplanation(item);
  } catch {
    return generateFallbackExplanation(item);
  }
}

function generateFallbackExplanation(
  item: ValidatedDifferenceItem
): string {
  const subject = getSubject(item);

  if (item.type === "new") {
    return `New information introduced: ${subject}.`;
  }

  if (item.type === "removed") {
    return `Information removed: ${subject}.`;
  }

  if (item.changeDetails) {
    return `Changed in ${subject}: ${item.changeDetails}.`;
  }

  return `Meaningful change detected in ${subject}.`;
}

// ---------------------------------------------------------------------------
// Main report generation
// ---------------------------------------------------------------------------

export async function generateReport(
  validatedItems: ValidatedDifferenceItem[]
): Promise<DifferenceItem[]> {
  const report: DifferenceItem[] = [];
  let idCounter = 1;

  for (const item of validatedItems) {
    // UNCHANGED items must never appear in the report
    if (item.type === "unchanged") continue;

    const hint = determinePresentationHint(item);
    const explanation = await generateExplanation(item);

    const diffItem: DifferenceItem = {
      id: `diff_${idCounter++}`,
      type: item.type,

      // Broad category used for grouping.
      topic:
        item.previousUnit?.topic ??
        item.currentUnit?.topic ??
        "Unknown",

      // Specific semantic field used as the card heading.
      subject: getSubject(item),

      explanation,
      confidence: item.confidence,
      presentationHint: hint,
      comparisonMethod: item.comparisonMethod,
    };

    if (item.previousUnit) {
      diffItem.previous = {
        content: formatContent(item.previousUnit),
        value:
          item.previousUnit.amountRaw ??
          item.previousUnit.amount,
        source: item.previousUnit.source,
      };
    }

    if (item.currentUnit) {
      diffItem.current = {
        content: formatContent(item.currentUnit),
        value:
          item.currentUnit.amountRaw ??
          item.currentUnit.amount,
        source: item.currentUnit.source,
      };
    }

    report.push(diffItem);
  }

  return report;
}