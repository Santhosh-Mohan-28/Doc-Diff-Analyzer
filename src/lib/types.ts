// ============================================================
// Document Difference Analyzer — Type System
// All types used across the comparison pipeline.
// No React/UI imports — pure TypeScript library types.
// ============================================================

// ---------------------------------------------------------------------------
// Source location — where in the document a proposition was found
// ---------------------------------------------------------------------------

export interface SourceLocation {
  /** Page number (1-indexed) */
  page: number;
  /** Section heading if identifiable */
  section?: string;
  /** Verbatim text from the document that supports this proposition */
  originalText: string;
}

// ---------------------------------------------------------------------------
// PropositionUnit — a meaningful claim/assertion from a document
//
// Designed to represent GENERAL PROPOSITIONS, not just key-value facts.
// A proposition may be a policy rule, eligibility condition, procedure,
// definition, limit, rate, date, or any meaningful assertion.
// ---------------------------------------------------------------------------

export interface PropositionUnit {
  /** Unique identifier within the document (e.g. "prev_1", "curr_3") */
  id: string;

  /** Short label identifying the subject of this proposition.
   *  e.g. "Medical Reimbursement Limit", "Application Deadline" */
  topic: string;

  /** Clear summary of the meaning of this proposition in plain English.
   *  This is the semantic representation — NOT the raw text. */
  statement: string;

  // Structured fields — all optional, populated only when applicable

  /** Who this proposition applies to */
  subject?: string;

  /** Eligibility condition(s) that must be met */
  eligibilityCondition?: string;

  /** What is granted or provided */
  benefit?: string;

  /** Monetary or numeric amount (as stated in document) */
  amount?: string;

  /** Exact amount text as it appears in the document (e.g. "₹20,000") */
  amountRaw?: string;

  /** Frequency or unit (e.g. "per month", "annually", "per trip") */
  unit?: string;

  /** Time period if separate from unit */
  period?: string;

  /** Any submission requirement (e.g. "within 30 days of expense") */
  submissionCondition?: string;

  /** Procedural steps or process description */
  procedure?: string;

  /** Exceptions or exclusions */
  exception?: string;

  /** If this is a definition, the term and its meaning */
  definition?: string;

  /** Effective date mentioned */
  effectiveDate?: string;

  /** Geographic or organizational scope */
  geographicScope?: string;

  /** Source location — mandatory */
  source: SourceLocation;

  /** Confidence that this extraction is complete and accurate (0–1) */
  extractionConfidence: number;
}

// ---------------------------------------------------------------------------
// NormalizedUnit — PropositionUnit after deterministic normalization
// ---------------------------------------------------------------------------

export interface NormalizedUnit extends PropositionUnit {
  /** Parsed numeric amount (e.g. 20000 for "₹20,000") */
  normalizedAmount?: number;

  /** Canonical currency (e.g. "INR") */
  normalizedCurrency?: string;

  /** Canonical period: "per_month" | "per_year" | "per_trip" | "per_day" | etc. */
  normalizedUnit?: string;

  /** Canonical submission window in days */
  normalizedSubmissionDays?: number;

  /** Normalized percentage value (e.g. 10 for "10%") */
  normalizedPercentage?: number;
}

// ---------------------------------------------------------------------------
// Semantic matching
// ---------------------------------------------------------------------------

export interface MatchedPair {
  previous: NormalizedUnit;
  current: NormalizedUnit;
  /** 0–1: confidence that these represent the same underlying concept */
  matchConfidence: number;
  /** Brief rationale for the match */
  matchRationale?: string;
}

export interface MatchResult {
  matched: MatchedPair[];
  unmatchedPrevious: NormalizedUnit[];
  unmatchedCurrent: NormalizedUnit[];
}

// ---------------------------------------------------------------------------
// Comparison classification
// ---------------------------------------------------------------------------

export type ChangeType = "changed" | "new" | "removed" | "unchanged";

export interface ClassifiedItem {
  type: ChangeType;

  /** Present for "changed" and "unchanged" */
  matchedPair?: MatchedPair;

  /** Present for "removed", or the previous unit in a "changed" item */
  previousUnit?: NormalizedUnit;

  /** Present for "new", or the current unit in a "changed" item */
  currentUnit?: NormalizedUnit;

  /** Human-readable description of what changed (for "changed" items) */
  changeDetails?: string;

  /** How the comparison was determined */
  comparisonMethod: "deterministic" | "ai-assisted";

  /** 0–1: confidence in this classification */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Evidence validation
// ---------------------------------------------------------------------------

export interface ValidatedDifferenceItem extends ClassifiedItem {
  /** Whether source evidence was verified against actual document text */
  evidenceValidated: boolean;
  /** Notes explaining any evidence validation issues */
  evidenceNotes?: string;
}

// ---------------------------------------------------------------------------
// Final output — difference items in the UI report
// ---------------------------------------------------------------------------

export type PresentationHint =
  | "value-change"       // numeric/monetary value changed: ₹250 → ₹500
  | "policy-change"      // policy or rule changed
  | "condition-change"   // eligibility or submission condition changed
  | "procedure-change"   // procedural step changed
  | "new-item"           // entirely new information
  | "removed-item"       // information removed
  | "multi-change"       // multiple related aspects changed
  | "date-change"        // date/deadline changed
  | "definition-change"; // definition changed

export interface DifferenceItemSource {
  content: string;
  value?: string;
  source?: SourceLocation;
}

export interface DifferenceItem {
  id: string;
  type: Exclude<ChangeType, "unchanged">;
  topic: string;

  /** Details from the previous document (undefined for "new" items) */
  previous?: DifferenceItemSource;

  /** Details from the current document (undefined for "removed" items) */
  current?: DifferenceItemSource;

  /** AI-generated human-readable explanation */
  explanation: string;

  /** 0–1: confidence in this difference */
  confidence: number;

  /** How to render this item in the UI */
  presentationHint: PresentationHint;

  /** How the comparison was determined */
  comparisonMethod: "deterministic" | "ai-assisted";
}

// ---------------------------------------------------------------------------
// Full comparison result returned by the API
// ---------------------------------------------------------------------------

export interface ComparisonSummary {
  changed: number;
  new: number;
  removed: number;
  /** Count only — unchanged content is NOT included in the detailed report */
  unchanged: number;
}

export interface ComparisonResult {
  summary: ComparisonSummary;
  /** Only CHANGED, NEW, REMOVED items — unchanged is suppressed */
  differences: DifferenceItem[];
  /** Warnings, suppressed items, processing notes */
  processingNotes?: string[];
}

// ---------------------------------------------------------------------------
// Document parsing output
// ---------------------------------------------------------------------------

export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface DocumentPages {
  pages: DocumentPage[];
  totalPages: number;
  fullText: string;
}

// ---------------------------------------------------------------------------
// API error response
// ---------------------------------------------------------------------------

export type ComparisonErrorCode =
  | "MISSING_FILE"
  | "INVALID_FILE_TYPE"
  | "CORRUPT_PDF"
  | "EMPTY_DOCUMENT"
  | "FILE_TOO_LARGE"
  | "GEMINI_ERROR"
  | "RATE_LIMIT"
  | "INVALID_AI_RESPONSE"
  | "PARSE_ERROR"
  | "EVIDENCE_VALIDATION_FAILED"
  | "INTERNAL_ERROR";

export interface ComparisonError {
  error: string;
  code: ComparisonErrorCode;
  details?: string;
}

// ---------------------------------------------------------------------------
// UI filter state
// ---------------------------------------------------------------------------

export type FilterType = "all" | "changed" | "new" | "removed";
