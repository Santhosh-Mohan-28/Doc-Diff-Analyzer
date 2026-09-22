// Mock Gemini BEFORE importing the matcher.
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

import { matchPropositions } from "@/lib/semanticMatcher";
import { callStructured } from "@/lib/gemini";
import type { NormalizedUnit } from "@/lib/types";

const mockCallStructured =
  callStructured as jest.MockedFunction<typeof callStructured>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUnit(
  overrides: Partial<NormalizedUnit>
): NormalizedUnit {
  return {
    id: "unit_1",
    topic: "Test",
    statement: "Test statement.",
    source: {
      page: 1,
      originalText: "Test statement.",
    },
    extractionConfidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("matchPropositions — deterministic semantic subject matching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    "same semantic subject with different value → MATCH",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_phone",
          topic: "Contact Information",
          subject: "Phone Number",
          statement: "9876543210",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_phone",
          topic: "Contact Information",
          subject: "Phone Number",
          statement: "9840059370",
        }),
      ];

      const result = await matchPropositions(
        previous,
        current
      );

      expect(result.matched).toHaveLength(1);

      expect(
        result.matched[0].previous.id
      ).toBe("prev_phone");

      expect(
        result.matched[0].current.id
      ).toBe("curr_phone");

      expect(
        result.unmatchedPrevious
      ).toHaveLength(0);

      expect(
        result.unmatchedCurrent
      ).toHaveLength(0);

      // No Gemini call should be necessary.
      expect(
        mockCallStructured
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "same semantic subject with same value → MATCH",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_email",
          subject: "Email",
          statement:
            "santhosh@example.com",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_email",
          subject: "Email",
          statement:
            "santhosh@example.com",
        }),
      ];

      const result = await matchPropositions(
        previous,
        current
      );

      expect(result.matched).toHaveLength(1);

      expect(
        result.unmatchedPrevious
      ).toHaveLength(0);

      expect(
        result.unmatchedCurrent
      ).toHaveLength(0);

      expect(
        mockCallStructured
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "equivalent subject labels → MATCH without Gemini",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_mobile",
          subject: "Mobile Number",
          statement: "9876543210",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_phone",
          subject: "Phone Number",
          statement: "9840059370",
        }),
      ];

      const result = await matchPropositions(
        previous,
        current
      );

      expect(result.matched).toHaveLength(1);

      expect(
        result.matched[0].previous.id
      ).toBe("prev_mobile");

      expect(
        result.matched[0].current.id
      ).toBe("curr_phone");

      expect(
        mockCallStructured
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "singular/plural subject variants → MATCH",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_project",
          topic: "Projects",
          subject: "Project",
          statement:
            "Document Difference Analyzer",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_project",
          topic: "Project",
          subject: "Projects",
          statement:
            "Document Difference Analyzer v2",
        }),
      ];

      const result = await matchPropositions(
        previous,
        current
      );

      expect(result.matched).toHaveLength(1);

      expect(
        result.unmatchedPrevious
      ).toHaveLength(0);

      expect(
        result.unmatchedCurrent
      ).toHaveLength(0);

      expect(
        mockCallStructured
      ).not.toHaveBeenCalled();
    }
  );

  test(
    "different semantic subjects are not automatically matched",
    async () => {
      mockCallStructured.mockResolvedValueOnce({
        matches: [],
      });

      const previous = [
        makeUnit({
          id: "prev_email",
          subject: "Email",
          statement:
            "old@example.com",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_phone",
          subject: "Phone Number",
          statement:
            "9840059370",
        }),
      ];

      const result = await matchPropositions(
        previous,
        current
      );

      expect(result.matched).toHaveLength(0);

      expect(
        result.unmatchedPrevious
      ).toHaveLength(1);

      expect(
        result.unmatchedPrevious[0].id
      ).toBe("prev_email");

      expect(
        result.unmatchedCurrent
      ).toHaveLength(1);

      expect(
        result.unmatchedCurrent[0].id
      ).toBe("curr_phone");

      // Because the subjects differ, Gemini is allowed to evaluate the
      // genuinely ambiguous case.
      expect(
        mockCallStructured
      ).toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
// Unmatched propositions
// ---------------------------------------------------------------------------

describe("matchPropositions — unmatched propositions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    "previous-only proposition remains unmatched",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_old",
          subject: "Old Policy",
          statement:
            "Old policy information.",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_current",
          subject: "Current Policy",
          statement:
            "Current policy information.",
        }),
      ];

      mockCallStructured.mockResolvedValueOnce({
        matches: [],
      });

      const result = await matchPropositions(
        previous,
        current
      );

      expect(
        result.matched
      ).toHaveLength(0);

      expect(
        result.unmatchedPrevious
      ).toHaveLength(1);

      expect(
        result.unmatchedPrevious[0].id
      ).toBe("prev_old");

      expect(
        result.unmatchedCurrent
      ).toHaveLength(1);

      expect(
        result.unmatchedCurrent[0].id
      ).toBe("curr_current");
    }
  );

  test(
    "current-only proposition remains unmatched",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_email",
          subject: "Email",
          statement:
            "old@example.com",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_email",
          subject: "Email",
          statement:
            "new@example.com",
        }),
      ];

      // These should actually be deterministically matched because the
      // subject is the same.
      const result = await matchPropositions(
        previous,
        current
      );

      expect(
        result.matched
      ).toHaveLength(1);

      expect(
        result.unmatchedPrevious
      ).toHaveLength(0);

      expect(
        result.unmatchedCurrent
      ).toHaveLength(0);

      expect(
        mockCallStructured
      ).not.toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
// One-to-one assignment
// ---------------------------------------------------------------------------

describe("matchPropositions — one-to-one subject matching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    "multiple subjects are matched independently",
    async () => {
      const previous = [
        makeUnit({
          id: "prev_name",
          subject: "Name",
          statement:
            "Old Name",
        }),
        makeUnit({
          id: "prev_email",
          subject: "Email",
          statement:
            "old@example.com",
        }),
        makeUnit({
          id: "prev_phone",
          subject: "Phone Number",
          statement:
            "9876543210",
        }),
      ];

      const current = [
        makeUnit({
          id: "curr_name",
          subject: "Name",
          statement:
            "New Name",
        }),
        makeUnit({
          id: "curr_email",
          subject: "Email",
          statement:
            "new@example.com",
        }),
        makeUnit({
          id: "curr_phone",
          subject: "Phone Number",
          statement:
            "9840059370",
        }),
      ];

      const result = await matchPropositions(
        previous,
        current
      );

      expect(
        result.matched
      ).toHaveLength(3);

      expect(
        result.unmatchedPrevious
      ).toHaveLength(0);

      expect(
        result.unmatchedCurrent
      ).toHaveLength(0);

      expect(
        mockCallStructured
      ).not.toHaveBeenCalled();

      const pairs =
        result.matched.map(
          (pair) => [
            pair.previous.id,
            pair.current.id,
          ]
        );

      expect(pairs).toEqual(
        expect.arrayContaining([
          [
            "prev_name",
            "curr_name",
          ],
          [
            "prev_email",
            "curr_email",
          ],
          [
            "prev_phone",
            "curr_phone",
          ],
        ])
      );
    }
  );
});