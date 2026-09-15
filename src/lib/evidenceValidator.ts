import type { ClassifiedItem, ValidatedDifferenceItem, DocumentPages } from "./types";

// ---------------------------------------------------------------------------
// Text presence verification
//
// Checks that a proposition's originalText is a genuine substring (or very
// near-match) of the actual text extracted from the referenced page.
//
// This prevents AI-hallucinated sources from appearing in the report.
// ---------------------------------------------------------------------------

function normalizeForCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s₹%]/g, "")
    .trim();
}

function isTextPresentInSource(originalText: string, documentText: string): boolean {
  if (!originalText || originalText.trim().length === 0) return false;

  const normOrig = normalizeForCheck(originalText);
  const normDoc = normalizeForCheck(documentText);

  // 1. Direct substring match (fastest path)
  if (normDoc.includes(normOrig)) return true;

  const words = normOrig.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return false;

  // 2. Short text (≤8 words): require ≥75% of words present
  if (words.length <= 8) {
    const matched = words.filter((w) => normDoc.includes(w)).length;
    return matched / words.length >= 0.75;
  }

  // 3. Longer text: sliding window of 7 consecutive words
  const windowSize = 7;
  for (let i = 0; i <= words.length - windowSize; i++) {
    const window = words.slice(i, i + windowSize).join(" ");
    if (normDoc.includes(window)) return true;
  }

  // 4. Fallback: ≥70% of significant words (len>4) present
  const sigWords = words.filter((w) => w.length > 4);
  if (sigWords.length === 0) return false;
  const present = sigWords.filter((w) => normDoc.includes(w)).length;
  return present / sigWords.length >= 0.7;
}

// ---------------------------------------------------------------------------
// Get the text for a given page number
// ---------------------------------------------------------------------------

function getPageText(pages: DocumentPages, pageNumber: number): string {
  const page = pages.pages.find((p) => p.pageNumber === pageNumber);
  return page?.text ?? pages.fullText;
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

export function validateEvidence(
  item: ClassifiedItem,
  prevPages: DocumentPages,
  currPages: DocumentPages
): ValidatedDifferenceItem {
  // Unchanged items never appear in the report — no strict evidence check needed
  if (item.type === "unchanged") {
    return { ...item, evidenceValidated: true };
  }

  const issues: string[] = [];

  // Validate previous source
  if (item.previousUnit) {
    const { originalText, page } = item.previousUnit.source;
    const pageText = getPageText(prevPages, page);
    if (!isTextPresentInSource(originalText, pageText)) {
      issues.push(
        `Previous source text not found in document at page ${page}: ` +
          `"${originalText.slice(0, 80)}${originalText.length > 80 ? "…" : ""}"`
      );
    }
  }

  // Validate current source
  if (item.currentUnit) {
    const { originalText, page } = item.currentUnit.source;
    const pageText = getPageText(currPages, page);
    if (!isTextPresentInSource(originalText, pageText)) {
      issues.push(
        `Current source text not found in document at page ${page}: ` +
          `"${originalText.slice(0, 80)}${originalText.length > 80 ? "…" : ""}"`
      );
    }
  }

  // NEW items must have a current source; REMOVED items must have a previous source
  if (item.type === "new" && !item.currentUnit) {
    issues.push("New item is missing a current source unit");
  }
  if (item.type === "removed" && !item.previousUnit) {
    issues.push("Removed item is missing a previous source unit");
  }

  return {
    ...item,
    evidenceValidated: issues.length === 0,
    evidenceNotes: issues.length > 0 ? issues.join("; ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Batch validation with optional filtering of unvalidated items
// ---------------------------------------------------------------------------

export interface ValidationReport {
  validated: ValidatedDifferenceItem[];
  rejected: ValidatedDifferenceItem[];
  processingNotes: string[];
}

export function validateAll(
  items: ClassifiedItem[],
  prevPages: DocumentPages,
  currPages: DocumentPages
): ValidationReport {
  const validated: ValidatedDifferenceItem[] = [];
  const rejected: ValidatedDifferenceItem[] = [];
  const notes: string[] = [];

  for (const item of items) {
    const result = validateEvidence(item, prevPages, currPages);

    if (result.type === "unchanged" || result.evidenceValidated) {
      validated.push(result);
    } else {
      // Evidence validation failed — suppress from report to avoid hallucinations
      rejected.push(result);
      const label =
        result.previousUnit?.topic ??
        result.currentUnit?.topic ??
        result.type;
      notes.push(
        `Suppressed "${label}" (${result.type}): evidence not traceable — ${result.evidenceNotes}`
      );
    }
  }

  if (rejected.length > 0) {
    notes.unshift(
      `${rejected.length} item(s) suppressed because source text could not be verified in the uploaded documents.`
    );
  }

  return { validated, rejected, processingNotes: notes };
}
