import { normalizeUnit, normalizeUnits } from "@/lib/normalizer";
import type { PropositionUnit } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<PropositionUnit>): PropositionUnit {
  return {
    id: "test_1",
    topic: "Test Topic",
    statement: "Test statement.",
    source: { page: 1, originalText: "Test original text." },
    extractionConfidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Currency normalization
// ---------------------------------------------------------------------------

describe("normalizeUnit — currency", () => {
  test("parses ₹ symbol with Indian comma format", () => {
    const unit = makeUnit({ amountRaw: "₹20,000" });
    const result = normalizeUnit(unit);
    expect(result.normalizedAmount).toBe(20000);
    expect(result.normalizedCurrency).toBe("INR");
  });

  test("parses Rs. format", () => {
    const unit = makeUnit({ amountRaw: "Rs. 1,500" });
    const result = normalizeUnit(unit);
    expect(result.normalizedAmount).toBe(1500);
    expect(result.normalizedCurrency).toBe("INR");
  });

  test("parses INR prefix in statement", () => {
    const unit = makeUnit({ statement: "Employees are entitled to INR 5,000 per month." });
    const result = normalizeUnit(unit);
    expect(result.normalizedAmount).toBe(5000);
    expect(result.normalizedCurrency).toBe("INR");
  });

  test("parses large Indian-format number (lakhs)", () => {
    const unit = makeUnit({ amountRaw: "₹1,00,000" });
    const result = normalizeUnit(unit);
    expect(result.normalizedAmount).toBe(100000);
  });

  test("returns undefined for unit with no currency data", () => {
    const unit = makeUnit({ statement: "All employees are eligible." });
    const result = normalizeUnit(unit);
    expect(result.normalizedAmount).toBeUndefined();
    expect(result.normalizedCurrency).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Period normalization
// ---------------------------------------------------------------------------

describe("normalizeUnit — period", () => {
  test("normalizes 'per month' → per_month", () => {
    const unit = makeUnit({ unit: "per month" });
    expect(normalizeUnit(unit).normalizedUnit).toBe("per_month");
  });

  test("normalizes 'monthly' → per_month", () => {
    const unit = makeUnit({ unit: "monthly" });
    expect(normalizeUnit(unit).normalizedUnit).toBe("per_month");
  });

  test("normalizes 'per annum' → per_year", () => {
    const unit = makeUnit({ unit: "per annum" });
    expect(normalizeUnit(unit).normalizedUnit).toBe("per_year");
  });

  test("normalizes 'annually' → per_year", () => {
    const unit = makeUnit({ unit: "annually" });
    expect(normalizeUnit(unit).normalizedUnit).toBe("per_year");
  });

  test("normalizes 'per trip' → per_trip", () => {
    const unit = makeUnit({ unit: "per trip" });
    expect(normalizeUnit(unit).normalizedUnit).toBe("per_trip");
  });

  test("normalizes 'per day' → per_day", () => {
    const unit = makeUnit({ unit: "per day" });
    expect(normalizeUnit(unit).normalizedUnit).toBe("per_day");
  });

  // CRITICAL GUARD: per_month ≠ per_year
  test("CRITICAL: per_month and per_year produce different normalizedUnit values", () => {
    const monthly = normalizeUnit(makeUnit({ unit: "per month" }));
    const annual = normalizeUnit(makeUnit({ unit: "per annum" }));
    expect(monthly.normalizedUnit).not.toBe(annual.normalizedUnit);
    expect(monthly.normalizedUnit).toBe("per_month");
    expect(annual.normalizedUnit).toBe("per_year");
  });
});

// ---------------------------------------------------------------------------
// Percentage normalization
// ---------------------------------------------------------------------------

describe("normalizeUnit — percentage", () => {
  test("parses '10%'", () => {
    const unit = makeUnit({ statement: "Coverage is 10% of salary." });
    expect(normalizeUnit(unit).normalizedPercentage).toBe(10);
  });

  test("parses '15 percent'", () => {
    const unit = makeUnit({ statement: "Contribution is 15 percent." });
    expect(normalizeUnit(unit).normalizedPercentage).toBe(15);
  });

  test("parses decimal percentage '7.5%'", () => {
    const unit = makeUnit({ statement: "Interest rate is 7.5% per annum." });
    expect(normalizeUnit(unit).normalizedPercentage).toBeCloseTo(7.5);
  });
});

// ---------------------------------------------------------------------------
// Submission deadline normalization
// ---------------------------------------------------------------------------

describe("normalizeUnit — submission deadline", () => {
  test("parses 'within 30 days'", () => {
    const unit = makeUnit({ submissionCondition: "Claims must be submitted within 30 days." });
    expect(normalizeUnit(unit).normalizedSubmissionDays).toBe(30);
  });

  test("parses 'no later than 60 days'", () => {
    const unit = makeUnit({ submissionCondition: "Submit no later than 60 days from expense date." });
    expect(normalizeUnit(unit).normalizedSubmissionDays).toBe(60);
  });

  test("parses 'within 2 months' as 60 days", () => {
    const unit = makeUnit({ submissionCondition: "Submit within 2 months." });
    expect(normalizeUnit(unit).normalizedSubmissionDays).toBe(60);
  });

  test("parses 'within 4 weeks' as 28 days", () => {
    const unit = makeUnit({ submissionCondition: "Submit within 4 weeks." });
    expect(normalizeUnit(unit).normalizedSubmissionDays).toBe(28);
  });

  test("returns undefined when no deadline mentioned", () => {
    const unit = makeUnit({ submissionCondition: "Submit to HR department." });
    expect(normalizeUnit(unit).normalizedSubmissionDays).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Batch normalization
// ---------------------------------------------------------------------------

describe("normalizeUnits", () => {
  test("normalizes an array and returns same length", () => {
    const units = [
      makeUnit({ id: "t1", amountRaw: "₹500", unit: "per month" }),
      makeUnit({ id: "t2", amountRaw: "₹500", unit: "per annum" }),
    ];
    const results = normalizeUnits(units);
    expect(results).toHaveLength(2);
    expect(results[0].normalizedUnit).toBe("per_month");
    expect(results[1].normalizedUnit).toBe("per_year");
    // Same amount, different period — these must NOT compare as equal
    expect(results[0].normalizedUnit).not.toBe(results[1].normalizedUnit);
  });
});

// ---------------------------------------------------------------------------
// Source text preservation guard
// ---------------------------------------------------------------------------

describe("normalizeUnit — source preservation", () => {
  test("never modifies source.originalText", () => {
    const original = "The employee shall receive ₹5,000 (five thousand rupees) monthly.";
    const unit = makeUnit({
      amountRaw: "₹5,000",
      unit: "monthly",
      source: { page: 1, originalText: original },
    });
    const result = normalizeUnit(unit);
    expect(result.source.originalText).toBe(original);
  });
});
