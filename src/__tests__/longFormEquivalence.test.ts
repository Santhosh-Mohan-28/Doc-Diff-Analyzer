// Long-form semantic equivalence tests.
// These test the deterministic layers (normalizer + evidenceValidator) to
// ensure they don't produce false positives for equivalent reformulations.
// The AI (Gemini) layer is NOT tested here — it has its own separate tests.
// ---------------------------------------------------------------------------

import { normalizeUnit } from "@/lib/normalizer";
import { validateEvidence } from "@/lib/evidenceValidator";
import type { PropositionUnit, ClassifiedItem, DocumentPages } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helper: build a proposition unit
// ---------------------------------------------------------------------------

function prop(overrides: Partial<PropositionUnit>): PropositionUnit {
  return {
    id: "t1",
    topic: "Test",
    statement: "Test statement.",
    source: { page: 1, originalText: "test" },
    extractionConfidence: 0.9,
    ...overrides,
  };
}

function makeDocPages(pageText: string): DocumentPages {
  return { pages: [{ pageNumber: 1, text: pageText }], totalPages: 1, fullText: pageText };
}

// ---------------------------------------------------------------------------
// 1. Equivalent currency representations must normalize to the same value
// ---------------------------------------------------------------------------

describe("Long-form equivalence — currency representations", () => {
  test("₹20,000 === INR 20,000 === Rs.20000", () => {
    const a = normalizeUnit(prop({ amountRaw: "₹20,000" }));
    const b = normalizeUnit(prop({ amountRaw: "INR 20,000" }));
    const c = normalizeUnit(prop({ amount: "Rs.20000" }));
    expect(a.normalizedAmount).toBe(20000);
    expect(b.normalizedAmount).toBe(20000);
    expect(c.normalizedAmount).toBe(20000);
  });

  test("₹1,00,000 (lakh) normalizes correctly to 100000", () => {
    const a = normalizeUnit(prop({ amountRaw: "₹1,00,000" }));
    expect(a.normalizedAmount).toBe(100000);
  });
});

// ---------------------------------------------------------------------------
// 2. Equivalent period representations must normalize to the same value
// ---------------------------------------------------------------------------

describe("Long-form equivalence — period representations", () => {
  test("'per month' === 'monthly' === 'each month'", () => {
    const a = normalizeUnit(prop({ unit: "per month" }));
    const b = normalizeUnit(prop({ unit: "monthly" }));
    const c = normalizeUnit(prop({ unit: "each month" }));
    expect(a.normalizedUnit).toBe("per_month");
    expect(b.normalizedUnit).toBe("per_month");
    expect(c.normalizedUnit).toBe("per_month");
  });

  test("'per annum' === 'annually' === 'per year' === 'each year'", () => {
    const variants = ["per annum", "annually", "per year", "each year", "yearly"];
    for (const v of variants) {
      expect(normalizeUnit(prop({ unit: v })).normalizedUnit).toBe("per_year");
    }
  });

  test("per_month and per_year are different canonical values (critical guard)", () => {
    expect("per_month").not.toBe("per_year");
  });
});

// ---------------------------------------------------------------------------
// 3. Equivalent percentage representations
// ---------------------------------------------------------------------------

describe("Long-form equivalence — percentage representations", () => {
  test("'10%' === '10 percent' === '10 per cent'", () => {
    const a = normalizeUnit(prop({ statement: "Deduction is 10% of base salary." }));
    const b = normalizeUnit(prop({ statement: "Deduction is 10 percent of base salary." }));
    const c = normalizeUnit(prop({ statement: "Deduction is 10 per cent of base salary." }));
    expect(a.normalizedPercentage).toBe(10);
    expect(b.normalizedPercentage).toBe(10);
    expect(c.normalizedPercentage).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 4. Equivalent submission deadline representations
// ---------------------------------------------------------------------------

describe("Long-form equivalence — submission deadlines", () => {
  test("'within 30 days' === '30 days from date' when parsed", () => {
    const a = normalizeUnit(prop({ submissionCondition: "Claims must be submitted within 30 days." }));
    const b = normalizeUnit(prop({ submissionCondition: "Claims must be submitted 30 days from expense date." }));
    expect(a.normalizedSubmissionDays).toBe(30);
    expect(b.normalizedSubmissionDays).toBe(30);
  });

  test("2 months (60 days) and 8 weeks (56 days) are NOT the same deadline", () => {
    const a = normalizeUnit(prop({ submissionCondition: "Submit within 2 months." }));
    const b = normalizeUnit(prop({ submissionCondition: "Submit within 8 weeks." }));
    // Both should be defined but different
    expect(a.normalizedSubmissionDays).toBe(60);
    expect(b.normalizedSubmissionDays).toBe(56);
    expect(a.normalizedSubmissionDays).not.toBe(b.normalizedSubmissionDays);
  });
});

// ---------------------------------------------------------------------------
// 5. Evidence validation must accept paraphrased originalText
// ---------------------------------------------------------------------------

describe("Long-form equivalence — evidence text presence (paraphrase tolerance)", () => {
  test("short key phrase present in longer page text passes validation", () => {
    const pageText =
      "All permanent employees who have completed at least one year of service " +
      "are eligible to claim medical reimbursement up to INR 20,000 per annum. " +
      "Claims must be submitted within 30 days of the expense date along with original receipts.";

    const docPages = makeDocPages(pageText);
    const emptyPages = makeDocPages("");

    const item: ClassifiedItem = {
      type: "changed",
      comparisonMethod: "deterministic",
      confidence: 0.9,
      previousUnit: {
        id: "p1",
        topic: "Medical Reimbursement",
        statement: "Permanent employees with 1+ year service may claim INR 20,000 per annum.",
        source: {
          page: 1,
          // Partial verbatim text from the document (expected to match)
          originalText: "medical reimbursement up to INR 20,000 per annum",
        },
        extractionConfidence: 0.9,
      },
    };

    const result = validateEvidence(item, docPages, emptyPages);
    expect(result.evidenceValidated).toBe(true);
  });

  test("entirely fabricated text fails validation", () => {
    const pageText = "Travel allowance: ₹500 per trip, maximum 10 trips per year.";
    const docPages = makeDocPages(pageText);
    const emptyPages = makeDocPages("");

    const item: ClassifiedItem = {
      type: "changed",
      comparisonMethod: "ai-assisted",
      confidence: 0.8,
      previousUnit: {
        id: "p1",
        topic: "Reimbursement",
        statement: "Employees receive satellite dish reimbursement quarterly.",
        source: {
          page: 1,
          originalText:
            "satellite dish reimbursement quarterly up to INR 15,000 for international employees",
        },
        extractionConfidence: 0.9,
      },
    };

    const result = validateEvidence(item, docPages, emptyPages);
    expect(result.evidenceValidated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Long paragraph — sliding window detection
// ---------------------------------------------------------------------------

describe("Long-form equivalence — sliding window text detection", () => {
  test("7-word window found within long page text", () => {
    // A realistic HR policy paragraph
    const pageText =
      "The company provides a comprehensive healthcare package to all employees. " +
      "Under this scheme, confirmed employees who have been on the payroll for a minimum " +
      "period of six months are entitled to claim reimbursement for medical expenses " +
      "incurred for themselves and their immediate dependents including spouse, children, " +
      "and dependent parents. The maximum claimable amount is capped at INR 50,000 per annum " +
      "subject to submission of original bills and prescriptions within sixty days of the " +
      "date of incurring the expense.";

    const docPages = makeDocPages(pageText);
    const emptyPages = makeDocPages("");

    const item: ClassifiedItem = {
      type: "removed",
      comparisonMethod: "deterministic",
      confidence: 0.8,
      previousUnit: {
        id: "p1",
        topic: "Healthcare Package",
        statement:
          "Confirmed employees (6+ months) may claim up to INR 50,000 per annum for medical expenses for self and dependents, within 60 days of expense.",
        source: {
          page: 1,
          // 10-word verbatim phrase from the long paragraph
          originalText:
            "original bills and prescriptions within sixty days of the date of incurring the expense",
        },
        extractionConfidence: 0.9,
      },
    };

    const result = validateEvidence(item, docPages, emptyPages);
    expect(result.evidenceValidated).toBe(true);
  });
});
