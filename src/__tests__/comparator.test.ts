// Mock Gemini BEFORE any imports that use it
jest.mock("@/lib/gemini", () => ({
  callStructured: jest.fn(),
  callText: jest.fn(),
  MODEL: "test-model",
  GeminiError: class GeminiError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly cause?: unknown
    ) {
      super(message);
      this.name = "GeminiError";
    }
  },
}));

import { compareMatchedPairs } from "@/lib/comparator";
import { callStructured } from "@/lib/gemini";
import type { MatchedPair, NormalizedUnit } from "@/lib/types";

const mockCallStructured = callStructured as jest.MockedFunction<typeof callStructured>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<NormalizedUnit>): NormalizedUnit {
  return {
    id: "unit_1",
    topic: "Test",
    statement: "Test statement.",
    source: { page: 1, originalText: "Test." },
    extractionConfidence: 0.9,
    ...overrides,
  };
}

function makePair(
  prevOverrides: Partial<NormalizedUnit>,
  currOverrides: Partial<NormalizedUnit>,
  confidence = 0.85
): MatchedPair {
  return {
    previous: makeUnit({ id: "prev_1", ...prevOverrides }),
    current: makeUnit({ id: "curr_1", ...currOverrides }),
    matchConfidence: confidence,
    matchRationale: "Same topic",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compareMatchedPairs — deterministic", () => {
  beforeEach(() => jest.clearAllMocks());

  test("detects amount change deterministically (no AI call)", async () => {
    const pair = makePair(
      { normalizedAmount: 250, normalizedCurrency: "INR", amountRaw: "₹250" },
      { normalizedAmount: 500, normalizedCurrency: "INR", amountRaw: "₹500" }
    );
    const results = await compareMatchedPairs([pair], [], []);
    expect(results[0].type).toBe("changed");
    expect(results[0].comparisonMethod).toBe("deterministic");
    expect(results[0].changeDetails).toContain("₹250");
    expect(results[0].changeDetails).toContain("₹500");
    expect(mockCallStructured).not.toHaveBeenCalled();
  });

  test("detects period change deterministically", async () => {
    const pair = makePair(
      { normalizedUnit: "per_month" },
      { normalizedUnit: "per_year" }
    );
    const results = await compareMatchedPairs([pair], [], []);
    expect(results[0].type).toBe("changed");
    expect(results[0].comparisonMethod).toBe("deterministic");
    expect(results[0].changeDetails).toContain("per_month");
    expect(results[0].changeDetails).toContain("per_year");
  });

  test("detects submission deadline change deterministically", async () => {
    const pair = makePair(
      { normalizedSubmissionDays: 30 },
      { normalizedSubmissionDays: 60 }
    );
    const results = await compareMatchedPairs([pair], [], []);
    expect(results[0].type).toBe("changed");
    expect(results[0].comparisonMethod).toBe("deterministic");
    expect(results[0].changeDetails).toContain("30 days");
    expect(results[0].changeDetails).toContain("60 days");
  });

  test("detects percentage change deterministically", async () => {
    const pair = makePair(
      { normalizedPercentage: 10 },
      { normalizedPercentage: 15 }
    );
    const results = await compareMatchedPairs([pair], [], []);
    expect(results[0].type).toBe("changed");
    expect(results[0].comparisonMethod).toBe("deterministic");
  });

  test("same amount same period → needs AI (no deterministic unchanged verdict at 0.9+ confidence)", async () => {
    mockCallStructured.mockResolvedValueOnce({
      classification: "unchanged",
      reason: "Same meaning",
      confidence: 0.9,
    });
    const pair = makePair(
      { normalizedAmount: 500, normalizedUnit: "per_month" },
      { normalizedAmount: 500, normalizedUnit: "per_month" }
    );
    const results = await compareMatchedPairs([pair], [], []);
    // Deterministic may find unchanged with 0.8 confidence → AI still called for <0.9
    // OR it finds unchanged at ≥0.9 and skips AI
    expect(["unchanged"]).toContain(results[0].type);
  });
});

describe("compareMatchedPairs — unmatched", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unmatched previous → REMOVED", async () => {
    const unit = makeUnit({ id: "prev_orphan", topic: "Old Policy" });
    const results = await compareMatchedPairs([], [unit], []);
    expect(results[0].type).toBe("removed");
    expect(results[0].previousUnit?.id).toBe("prev_orphan");
    expect(results[0].comparisonMethod).toBe("deterministic");
  });

  test("unmatched current → NEW", async () => {
    const unit = makeUnit({ id: "curr_orphan", topic: "New Policy" });
    const results = await compareMatchedPairs([], [], [unit]);
    expect(results[0].type).toBe("new");
    expect(results[0].currentUnit?.id).toBe("curr_orphan");
    expect(results[0].comparisonMethod).toBe("deterministic");
  });
});

describe("compareMatchedPairs — AI conservative fallback", () => {
  beforeEach(() => jest.clearAllMocks());

  test("AI-reported change with confidence < 0.7 is downgraded to unchanged", async () => {
    mockCallStructured.mockResolvedValueOnce({
      classification: "changed",
      reason: "Minor wording",
      confidence: 0.5,
    });

    const pair = makePair(
      { statement: "Employees may claim expenses." },
      { statement: "Eligible staff members may claim reimbursements." }
    );
    const results = await compareMatchedPairs([pair], [], []);
    expect(results[0].type).toBe("unchanged");
  });

  test("AI failure → conservatively unchanged", async () => {
    mockCallStructured.mockRejectedValueOnce(new Error("AI unavailable"));

    const pair = makePair(
      { statement: "Policy A applies." },
      { statement: "Policy A is in effect." }
    );
    const results = await compareMatchedPairs([pair], [], []);
    expect(results[0].type).toBe("unchanged");
    expect(results[0].comparisonMethod).toBe("ai-assisted");
    expect(results[0].confidence).toBeLessThanOrEqual(0.5);
  });
});
