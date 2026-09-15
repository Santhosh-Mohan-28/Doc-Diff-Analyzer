import { validateEvidence, validateAll } from "@/lib/evidenceValidator";
import type { ClassifiedItem, DocumentPages } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDocPages(texts: string[]): DocumentPages {
  const pages = texts.map((text, i) => ({ pageNumber: i + 1, text }));
  return {
    pages,
    totalPages: pages.length,
    fullText: texts.join("\n\n"),
  };
}

function makeClassifiedItem(overrides: Partial<ClassifiedItem>): ClassifiedItem {
  return {
    type: "changed",
    comparisonMethod: "deterministic",
    confidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Evidence validation tests
// ---------------------------------------------------------------------------

describe("validateEvidence — text presence", () => {
  const prevPages = makeDocPages([
    "The medical reimbursement limit is INR 20,000 per annum for all confirmed employees.",
    "Claims must be submitted within 30 days of the expense date.",
  ]);

  const currPages = makeDocPages([
    "The healthcare expense benefit is capped at INR 30,000 annually for permanent staff.",
    "Reimbursement applications must be filed no later than 60 days from the date of expense.",
  ]);

  test("validates item with text present in both documents", () => {
    const item = makeClassifiedItem({
      type: "changed",
      previousUnit: {
        id: "prev_1",
        topic: "Medical Reimbursement Limit",
        statement: "Medical reimbursement limit is INR 20,000 per annum.",
        source: { page: 1, originalText: "medical reimbursement limit is INR 20,000" },
        extractionConfidence: 0.9,
      },
      currentUnit: {
        id: "curr_1",
        topic: "Healthcare Expense Benefit",
        statement: "Healthcare expense benefit capped at INR 30,000 annually.",
        source: { page: 1, originalText: "healthcare expense benefit is capped at INR 30,000" },
        extractionConfidence: 0.9,
      },
    });

    const result = validateEvidence(item, prevPages, currPages);
    expect(result.evidenceValidated).toBe(true);
    expect(result.evidenceNotes).toBeUndefined();
  });

  test("rejects item with hallucinated previous text", () => {
    const item = makeClassifiedItem({
      type: "changed",
      previousUnit: {
        id: "prev_2",
        topic: "Invented Benefit",
        statement: "This benefit does not exist in the document.",
        source: {
          page: 1,
          originalText: "satellite dish reimbursement is available at INR 99,999",
        },
        extractionConfidence: 0.9,
      },
      currentUnit: {
        id: "curr_2",
        topic: "Healthcare Expense Benefit",
        statement: "Healthcare expense benefit capped at INR 30,000.",
        source: { page: 1, originalText: "healthcare expense benefit is capped at INR 30,000" },
        extractionConfidence: 0.9,
      },
    });

    const result = validateEvidence(item, prevPages, currPages);
    expect(result.evidenceValidated).toBe(false);
    expect(result.evidenceNotes).toBeTruthy();
  });

  test("unchanged items pass validation without checking text", () => {
    const item = makeClassifiedItem({
      type: "unchanged",
      previousUnit: {
        id: "prev_3",
        topic: "Some Policy",
        statement: "Some policy statement.",
        source: { page: 1, originalText: "completely fictional text that is not in any document" },
        extractionConfidence: 0.9,
      },
    });

    const result = validateEvidence(item, prevPages, currPages);
    // Unchanged items bypass evidence check
    expect(result.evidenceValidated).toBe(true);
  });

  test("validates new item (only current source checked)", () => {
    const item = makeClassifiedItem({
      type: "new",
      currentUnit: {
        id: "curr_3",
        topic: "Submission Deadline",
        statement: "Claims must be filed within 60 days.",
        source: {
          page: 2,
          originalText: "no later than 60 days from the date of expense",
        },
        extractionConfidence: 0.9,
      },
    });

    const result = validateEvidence(item, prevPages, currPages);
    expect(result.evidenceValidated).toBe(true);
  });

  test("validates removed item (only previous source checked)", () => {
    const item = makeClassifiedItem({
      type: "removed",
      previousUnit: {
        id: "prev_4",
        topic: "Old Deadline",
        statement: "Claims must be submitted within 30 days.",
        source: {
          page: 2,
          originalText: "submitted within 30 days of the expense date",
        },
        extractionConfidence: 0.9,
      },
    });

    const result = validateEvidence(item, prevPages, currPages);
    expect(result.evidenceValidated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

describe("validateAll", () => {
  test("separates validated and rejected items", () => {
    const prevPages = makeDocPages(["Medical claims up to INR 5,000 per year."]);
    const currPages = makeDocPages(["Medical claims up to INR 10,000 per year."]);

    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: "changed",
        previousUnit: {
          id: "p1", topic: "Medical", statement: "Up to INR 5,000.",
          source: { page: 1, originalText: "Medical claims up to INR 5,000" },
          extractionConfidence: 0.9,
        },
        currentUnit: {
          id: "c1", topic: "Medical", statement: "Up to INR 10,000.",
          source: { page: 1, originalText: "Medical claims up to INR 10,000" },
          extractionConfidence: 0.9,
        },
      }),
      makeClassifiedItem({
        type: "new",
        currentUnit: {
          id: "c2", topic: "Hallucinated Policy",
          statement: "Employees get free jets.",
          source: { page: 1, originalText: "free jets for all employees quarterly" },
          extractionConfidence: 0.9,
        },
      }),
    ];

    const report = validateAll(items, prevPages, currPages);
    expect(report.validated.length).toBe(1);
    expect(report.rejected.length).toBe(1);
    expect(report.processingNotes.length).toBeGreaterThan(0);
  });

  test("unchanged items always end up in validated", () => {
    const prevPages = makeDocPages(["Some policy text."]);
    const currPages = makeDocPages(["Some policy text."]);

    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: "unchanged",
        previousUnit: {
          id: "p1", topic: "Policy", statement: "Same.",
          source: { page: 1, originalText: "invented text not in document" },
          extractionConfidence: 0.9,
        },
      }),
    ];

    const report = validateAll(items, prevPages, currPages);
    expect(report.validated.length).toBe(1);
    expect(report.rejected.length).toBe(0);
  });
});
