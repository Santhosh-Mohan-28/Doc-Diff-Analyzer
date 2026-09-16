import type {
  NormalizedUnit,
  MatchedPair,
  MatchResult,
} from "./types";
import { callStructured } from "./gemini";

// ---------------------------------------------------------------------------
// Affinity scoring helpers
// ---------------------------------------------------------------------------

// Affinity is ONLY used to prioritize candidate pairs.
// It must NEVER be used as a hard exclusion rule.

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "must",
  "per",
  "that",
  "this",
  "it",
  "its",
  "as",
  "if",
  "all",
  "any",
  "each",
  "employee",
  "employees",
  "eligible",
  "staff",
  "member",
  "members",
  "policy",
  "document",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !STOP_WORDS.has(w)
      )
  );
}

function jaccard(
  a: Set<string>,
  b: Set<string>
): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  const inter = new Set(
    Array.from(a).filter((x) => b.has(x))
  );

  const union = new Set([
    ...Array.from(a),
    ...Array.from(b),
  ]);

  return inter.size / union.size;
}

// ---------------------------------------------------------------------------
// Semantic subject normalization
//
// The extractor provides a stable semantic subject for each proposition.
// We normalize equivalent labels so that small wording differences do not
// prevent candidate generation.
//
// Examples:
//
// "Name"              -> "name"
// "Full Name"         -> "name"
// "Company"           -> "employer"
// "Employer"          -> "employer"
// "University"        -> "school"
// "College"           -> "school"
// "Phone Number"      -> "phone"
// "Mobile Number"     -> "phone"
// "Job Position"      -> "job title"
// ---------------------------------------------------------------------------

function normalizeSubject(
  subject: string
): string {
  const value = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<
    string,
    string
  > = {
    "full name": "name",
    "candidate name": "name",

    company: "employer",
    employer: "employer",
    organization: "employer",
    organisation: "employer",

    college: "school",
    university: "school",
    institution: "school",

    "phone number": "phone",
    "mobile number": "phone",
    mobile: "phone",
    telephone: "phone",

    "email address": "email",

    "job position": "job title",
    position: "job title",
    role: "job title",

    qualification: "degree",
    "educational qualification": "degree",

    "work experience": "experience",
    employment: "experience",

    "technical skills": "skills",
    skill: "skills",
    skills: "skills",

    certificate: "certification",
    certifications: "certification",

    "due date": "deadline",
    "submission deadline": "deadline",

    "interest rate": "interest rate",
    rate: "rate",

    "coverage amount": "coverage limit",
    "maximum coverage": "coverage limit",
  };

  return aliases[value] ?? value;
}

function subjectSimilarity(
  previous: NormalizedUnit,
  current: NormalizedUnit
): number {
  const previousSubject =
    normalizeSubject(
      previous.subject ??
        previous.topic
    );

  const currentSubject =
    normalizeSubject(
      current.subject ??
        current.topic
    );

  if (
    !previousSubject ||
    !currentSubject
  ) {
    return 0;
  }

  if (
    previousSubject ===
    currentSubject
  ) {
    return 1;
  }

  return jaccard(
    tokenize(previousSubject),
    tokenize(currentSubject)
  );
}

// ---------------------------------------------------------------------------
// Label signal extraction
//
// This is generic and is not intended to be resume-specific.
// It helps recognize explicit field labels such as:
//
// "Name: Rahul"
// "School: ABC College"
// "Company: Google"
// "Interest Rate: 8.5%"
//
// Final semantic matching is still performed by Gemini.
// ---------------------------------------------------------------------------

function extractLabelSignals(
  text: string
): Set<string> {
  const labels = new Set<string>();

  const normalized = text
    .toLowerCase()
    .replace(/[|]/g, ":")
    .replace(/\s+/g, " ")
    .trim();

  // Explicit label before a colon.
  const colonMatch =
    normalized.match(
      /^([a-z][a-z0-9 /&()_-]{1,60})\s*:\s*/
    );

  if (colonMatch) {
    const label = colonMatch[1]
      .replace(/[&/()_-]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !STOP_WORDS.has(w)
      );

    for (const word of label) {
      labels.add(word);
    }
  }

  // Common structural prefixes.
  const prefixPatterns = [
    /^(name|full name)\b/,
    /^(email|email address)\b/,
    /^(phone|phone number|mobile|mobile number)\b/,
    /^(school|college|university|institution)\b/,
    /^(education|educational qualification)\b/,
    /^(degree|qualification)\b/,
    /^(company|employer|organization|organisation)\b/,
    /^(job title|title|position|role)\b/,
    /^(location|address|city|country)\b/,
    /^(skill|skills|technical skills)\b/,
    /^(project|projects)\b/,
    /^(certification|certifications|certificate)\b/,
    /^(experience|work experience|employment)\b/,
    /^(salary|compensation|pay)\b/,
    /^(deadline|due date|submission deadline)\b/,
    /^(amount|cost|price|fee)\b/,
    /^(percentage|rate|interest rate)\b/,
  ];

  for (const pattern of prefixPatterns) {
    const match =
      normalized.match(pattern);

    if (match?.[1]) {
      for (const word of match[1].split(
        /\s+/
      )) {
        if (
          word.length > 2 &&
          !STOP_WORDS.has(word)
        ) {
          labels.add(word);
        }
      }
    }
  }

  return labels;
}

// ---------------------------------------------------------------------------
// Affinity score
//
// Subject is the strongest signal.
//
// IMPORTANT:
// A completely different value can still have very high semantic
// correspondence when both propositions occupy the same conceptual slot.
//
// Affinity only prioritizes candidates. Gemini makes the actual semantic
// correspondence decision.
// ---------------------------------------------------------------------------

function computeAffinity(
  prev: NormalizedUnit,
  curr: NormalizedUnit
): number {
  const subjectSimilarityScore =
    subjectSimilarity(
      prev,
      curr
    );

  const topicSimilarity =
    jaccard(
      tokenize(prev.topic),
      tokenize(curr.topic)
    );

  const statementSimilarity =
    jaccard(
      tokenize(prev.statement),
      tokenize(curr.statement)
    );

  const prevLabels =
    extractLabelSignals(
      `${prev.topic}: ${prev.statement}`
    );

  const currLabels =
    extractLabelSignals(
      `${curr.topic}: ${curr.statement}`
    );

  const labelSimilarity =
    jaccard(
      prevLabels,
      currLabels
    );

  let score = 0;

  // Stable semantic subject is the strongest signal.
  score +=
    subjectSimilarityScore *
    0.55;

  score +=
    topicSimilarity * 0.20;

  score +=
    statementSimilarity * 0.15;

  score +=
    labelSimilarity * 0.10;

  if (
    prev.normalizedAmount !==
      undefined &&
    curr.normalizedAmount !==
      undefined &&
    prev.normalizedAmount ===
      curr.normalizedAmount
  ) {
    score += 0.025;
  }

  if (
    prev.normalizedUnit !==
      undefined &&
    curr.normalizedUnit !==
      undefined &&
    prev.normalizedUnit ===
      curr.normalizedUnit
  ) {
    score += 0.025;
  }

  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Candidate generation
//
// ARCHITECTURAL RULE:
//
// Candidate generation is recall-focused.
//
// Different wording or different values must NOT prevent a possible match.
//
// Every previous unit and every current unit is guaranteed to appear in
// at least one candidate pair.
// ---------------------------------------------------------------------------

interface CandidatePair {
  prev: NormalizedUnit;
  curr: NormalizedUnit;
  affinity: number;
}

function generateCandidates(
  previous: NormalizedUnit[],
  current: NormalizedUnit[]
): CandidatePair[] {
  if (
    previous.length === 0 ||
    current.length === 0
  ) {
    return [];
  }

  const all: CandidatePair[] = [];

  for (const prev of previous) {
    for (const curr of current) {
      all.push({
        prev,
        curr,
        affinity:
          computeAffinity(
            prev,
            curr
          ),
      });
    }
  }

  all.sort(
    (a, b) =>
      b.affinity -
      a.affinity
  );

  const prevCovered =
    new Set<string>();

  const currCovered =
    new Set<string>();

  const candidates: CandidatePair[] =
    [];

  for (const pair of all) {
    const prevNeedsCoverage =
      !prevCovered.has(
        pair.prev.id
      );

    const currNeedsCoverage =
      !currCovered.has(
        pair.curr.id
      );

    // Include reasonably strong candidates plus anything needed to
    // guarantee that every proposition is represented.
    const highAffinity =
      pair.affinity >= 0.15;

    if (
      prevNeedsCoverage ||
      currNeedsCoverage ||
      highAffinity
    ) {
      candidates.push(pair);

      prevCovered.add(
        pair.prev.id
      );

      currCovered.add(
        pair.curr.id
      );
    }
  }

  // Safety net: every previous proposition must have a candidate.
  for (const prev of previous) {
    if (
      !prevCovered.has(prev.id)
    ) {
      candidates.push({
        prev,
        curr: current[0],
        affinity: 0,
      });
    }
  }

  // Safety net: every current proposition must have a candidate.
  for (const curr of current) {
    if (
      !currCovered.has(curr.id)
    ) {
      candidates.push({
        prev: previous[0],
        curr,
        affinity: 0,
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Gemini semantic matching
// ---------------------------------------------------------------------------

const MATCH_BATCH_SIZE = 25;

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          previousId: {
            type: "string",
          },
          currentId: {
            type: "string",
          },
          confidence: {
            type: "number",
          },
          rationale: {
            type: "string",
          },
        },
        required: [
          "previousId",
          "currentId",
          "confidence",
          "rationale",
        ],
      },
    },
  },
  required: ["matches"],
};

const MATCH_SYSTEM_PROMPT = `You are a semantic matching expert for document comparison.

Your job is to determine whether a proposition from the PREVIOUS document and a proposition from the CURRENT document refer to the SAME underlying fact, field, concept, rule, requirement, entity, or semantic slot.

CRITICAL PRINCIPLE:

A change in VALUE does NOT mean that the proposition is a new concept.

If both propositions describe the same field or semantic slot but contain different values, THEY MUST MATCH.

Examples:

Previous:
Subject: name
Statement: Rahul Kumar

Current:
Subject: name
Statement: Santhosh Mohan

=> MATCH.

The field is "name"; only its value changed.

---

Previous:
Subject: school
Statement: ABC Engineering College

Current:
Subject: school
Statement: Easwari Engineering College

=> MATCH.

The field is "school"; only its value changed.

---

Previous:
Subject: employer
Statement: Google

Current:
Subject: employer
Statement: Microsoft

=> MATCH.

The field is "employer"; only its value changed.

---

Previous:
Subject: email
Statement: rahul@example.com

Current:
Subject: email
Statement: santhosh@example.com

=> MATCH.

---

Previous:
Subject: interest rate
Statement: 8.5%

Current:
Subject: interest rate
Statement: 9%

=> MATCH.

The value changed. The semantic subject did not.

MATCH when:

- The semantic subject is the same.
- The field is the same but its value changed.
- The same entity/property is described with different values.
- The same policy/rule/requirement is described using different wording.
- The same concept appears in another section.
- The same information is represented as a table instead of prose.
- Paragraphs were split or merged.
- Synonyms are used.
- Equivalent terminology is used.
- Dates, currencies, units, or numerical formatting differ but represent the same field.
- The propositions describe the same underlying semantic role even when textual similarity is low.

DO NOT require the values themselves to be similar.

DO NOT interpret a different value as evidence that the concept itself is different.

DO NOT classify the same field with a changed value as both REMOVED and NEW.

The comparison stage will determine whether a matched pair is actually CHANGED or UNCHANGED.

Use the explicit Subject field as a strong semantic signal, but also consider Topic and Statement for context.

Section placement does not matter.

A proposition may have moved to another section and still correspond to the previous proposition.

Formatting does not matter.

A table row, paragraph, bullet, heading, or sentence can represent the same underlying proposition.

Paragraph splitting and merging do not prevent a match.

However, fundamentally different concepts must NOT be matched merely because they share words.

For example:

Subject: interest rate
and
Subject: application deadline

are different semantic subjects.

Likewise, two unrelated rules that happen to contain similar words should not be matched.

Each proposition may match at most one proposition on the other side.

Return only matches with confidence >= 0.55.

When the Subject fields are exact or semantically equivalent, give strong confidence even if the values themselves are completely different.

Return confirmed correspondence pairs with confidence and a short rationale.`;

interface GeminiMatch {
  previousId: string;
  currentId: string;
  confidence: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Main match function
// ---------------------------------------------------------------------------

export async function matchPropositions(
  previous: NormalizedUnit[],
  current: NormalizedUnit[]
): Promise<MatchResult> {
  if (
    !previous.length &&
    !current.length
  ) {
    return {
      matched: [],
      unmatchedPrevious: [],
      unmatchedCurrent: [],
    };
  }

  if (!previous.length) {
    return {
      matched: [],
      unmatchedPrevious: [],
      unmatchedCurrent: current,
    };
  }

  if (!current.length) {
    return {
      matched: [],
      unmatchedPrevious: previous,
      unmatchedCurrent: [],
    };
  }

  // -------------------------------------------------------------------------
  // Step 1: Generate recall-focused candidates
  // -------------------------------------------------------------------------

  const candidates =
    generateCandidates(
      previous,
      current
    );

  // -------------------------------------------------------------------------
  // Step 2: Ask Gemini to identify semantic correspondences.
  //
  // We do NOT immediately lock a match when Gemini returns it.
  //
  // We collect all proposed matches first, then perform a global
  // confidence-based one-to-one assignment.
  // -------------------------------------------------------------------------

  const allProposedMatches: GeminiMatch[] =
    [];

  const prevMap = new Map(
    previous.map((p) => [
      p.id,
      p,
    ])
  );

  const currMap = new Map(
    current.map((c) => [
      c.id,
      c,
    ])
  );

  for (
    let i = 0;
    i < candidates.length;
    i += MATCH_BATCH_SIZE
  ) {
    const batch =
      candidates.slice(
        i,
        i + MATCH_BATCH_SIZE
      );

    if (!batch.length) {
      continue;
    }

    const pairDescriptions =
      batch
        .map(
          (pair, idx) =>
            `Pair ${idx + 1}:

Previous [${pair.prev.id}]
Subject: ${pair.prev.subject ?? ""}
Topic: ${pair.prev.topic}
Statement: ${pair.prev.statement}

Current [${pair.curr.id}]
Subject: ${pair.curr.subject ?? ""}
Topic: ${pair.curr.topic}
Statement: ${pair.curr.statement}

Candidate affinity: ${pair.affinity.toFixed(
              2
            )}`
        )
        .join("\n\n");

    try {
      const result =
        await callStructured<{
          matches: GeminiMatch[];
        }>(
          MATCH_SYSTEM_PROMPT,

          `Evaluate these candidate pairs.

For EACH pair, determine whether the Previous and Current propositions refer to the SAME underlying field, fact, concept, rule, requirement, entity, or semantic slot.

Prioritize the explicit Subject field.

Remember:

- Same subject with different value = MATCH.
- Different name values can still match the "name" field.
- Different school values can still match the "school" field.
- Different company values can still match the "employer" field.
- Different email values can still match the "email" field.
- Different phone values can still match the "phone" field.
- Different location values can still match the "location" field.
- Different rate values can still match the "interest rate" field.
- Do not confuse a changed value with a removed concept.
- A fact moved to another section can still match.
- Different wording or formatting can still represent the same proposition.
- The later comparison stage will determine whether the matched pair is CHANGED or UNCHANGED.

CANDIDATE PAIRS:

${pairDescriptions}`,

          MATCH_SCHEMA
        );

      for (
        const match of
          result.matches ?? []
      ) {
        const prev =
          prevMap.get(
            match.previousId
          );

        const curr =
          currMap.get(
            match.currentId
          );

        if (!prev || !curr) {
          continue;
        }

        if (
          match.confidence <
          0.55
        ) {
          continue;
        }

        allProposedMatches.push(
          match
        );
      }
    } catch (err) {
      console.error(
        `[matcher] Batch ${Math.floor(
          i /
            MATCH_BATCH_SIZE
        ) + 1} failed:`,
        err
      );

      // Never turn a Gemini failure into an apparently valid comparison.
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Global one-to-one assignment
  //
  // Sort all proposed matches by confidence.
  // Then accept the strongest available correspondence for each proposition.
  // -------------------------------------------------------------------------

  allProposedMatches.sort(
    (a, b) =>
      b.confidence -
      a.confidence
  );

  const matchedPrev =
    new Set<string>();

  const matchedCurr =
    new Set<string>();

  const confirmed: MatchedPair[] =
    [];

  for (
    const match of
      allProposedMatches
  ) {
    const prev =
      prevMap.get(
        match.previousId
      );

    const curr =
      currMap.get(
        match.currentId
      );

    if (!prev || !curr) {
      continue;
    }

    if (
      matchedPrev.has(
        prev.id
      ) ||
      matchedCurr.has(
        curr.id
      )
    ) {
      continue;
    }

    confirmed.push({
      previous: prev,
      current: curr,
      matchConfidence:
        match.confidence,
      matchRationale:
        match.rationale,
    });

    matchedPrev.add(
      prev.id
    );

    matchedCurr.add(
      curr.id
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Determine genuinely unmatched propositions.
  //
  // Anything that was not matched becomes a candidate for NEW or REMOVED.
  // -------------------------------------------------------------------------

  const unmatchedPrevious =
    previous.filter(
      (unit) =>
        !matchedPrev.has(
          unit.id
        )
    );

  const unmatchedCurrent =
    current.filter(
      (unit) =>
        !matchedCurr.has(
          unit.id
        )
    );

  return {
    matched: confirmed,
    unmatchedPrevious,
    unmatchedCurrent,
  };
}