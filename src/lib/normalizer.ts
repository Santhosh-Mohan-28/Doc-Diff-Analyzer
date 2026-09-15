import type { PropositionUnit, NormalizedUnit } from "./types";

// ---------------------------------------------------------------------------
// GUARD: normalizer never touches source.originalText.
// It only adds normalizedXxx fields to extracted, structured fields.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Currency parsing — supports INR / ₹ / Rs. formats
// ---------------------------------------------------------------------------

const CURRENCY_REGEXES = [
  /(?:₹|Rs\.?\s*|INR\s*)([0-9,]+(?:\.[0-9]+)?)/gi,
  /([0-9,]+(?:\.[0-9]+)?)\s*(?:INR|rupees?)\b/gi,
];

/** Parse an Indian-format number string (e.g. "1,00,000") to a float. */
function parseIndianNumber(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

function parseCurrency(text: string): { amount: number; currency: string } | null {
  for (const pattern of CURRENCY_REGEXES) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m) {
      const amt = parseIndianNumber(m[1]);
      if (!isNaN(amt)) return { amount: amt, currency: "INR" };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Period / frequency normalization
// ---------------------------------------------------------------------------

const PERIOD_MAP: Array<[RegExp, string]> = [
  [/\bper\s+month\b|\bmonthly\b|\bevery\s+month\b|\beach\s+month\b/i, "per_month"],
  [/\bper\s+annum\b|\bannually\b|\bper\s+year\b|\byearly\b|\beach\s+year\b/i, "per_year"],
  [/\bper\s+trip\b|\bper\s+travel\b|\bper\s+journey\b/i, "per_trip"],
  [/\bper\s+day\b|\bdaily\b/i, "per_day"],
  [/\bper\s+quarter\b|\bquarterly\b/i, "per_quarter"],
  [/\bone[\s-]?time\b|\bonce\b|\bsingle\s+occurrence\b/i, "one_time"],
  [/\bper\s+week\b|\bweekly\b/i, "per_week"],
];

function parsePeriod(text: string): string | undefined {
  for (const [re, canonical] of PERIOD_MAP) {
    if (re.test(text)) return canonical;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Percentage normalization
// ---------------------------------------------------------------------------

const PERCENTAGE_RE = /([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent(?:age)?|per\s+cent)\b/i;

function parsePercentage(text: string): number | undefined {
  const m = PERCENTAGE_RE.exec(text);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  return isNaN(v) ? undefined : v;
}

// ---------------------------------------------------------------------------
// Submission deadline normalization
// ---------------------------------------------------------------------------

const SUBMISSION_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
  [/within\s+(\d+)\s+days?/i, (m) => parseInt(m[1], 10)],
  [/no\s+later\s+than\s+(\d+)\s+days?/i, (m) => parseInt(m[1], 10)],
  [/(\d+)\s+days?\s+(?:from|of|after)\b/i, (m) => parseInt(m[1], 10)],
  [/within\s+(\d+)\s+months?/i, (m) => parseInt(m[1], 10) * 30],
  [/within\s+(\d+)\s+weeks?/i, (m) => parseInt(m[1], 10) * 7],
];

function parseSubmissionDays(text: string): number | undefined {
  for (const [re, extract] of SUBMISSION_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const days = extract(m);
      return isNaN(days) ? undefined : days;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main normalize function — adds normalizedXxx fields, never mutates originalText
// ---------------------------------------------------------------------------

export function normalizeUnit(unit: PropositionUnit): NormalizedUnit {
  const out: NormalizedUnit = { ...unit };

  // Build a search corpus from structured fields only (NOT originalText)
  const corpus = [
    unit.amountRaw ?? "",
    unit.amount ?? "",
    unit.unit ?? "",
    unit.period ?? "",
    unit.statement,
    unit.submissionCondition ?? "",
  ].join(" ");

  // Currency
  const currency = parseCurrency(unit.amountRaw ?? unit.amount ?? corpus);
  if (currency) {
    out.normalizedAmount = currency.amount;
    out.normalizedCurrency = currency.currency;
  }

  // Period / frequency
  const periodSrc = unit.unit ?? unit.period ?? unit.statement;
  const period = parsePeriod(periodSrc);
  if (period) out.normalizedUnit = period;

  // Percentage
  const pct = parsePercentage(corpus);
  if (pct !== undefined) out.normalizedPercentage = pct;

  // Submission deadline
  const subSrc = unit.submissionCondition ?? unit.statement;
  const days = parseSubmissionDays(subSrc);
  if (days !== undefined) out.normalizedSubmissionDays = days;

  return out;
}

export function normalizeUnits(units: PropositionUnit[]): NormalizedUnit[] {
  return units.map(normalizeUnit);
}
