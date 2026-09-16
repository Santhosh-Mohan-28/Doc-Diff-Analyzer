import type { DocumentPages, PropositionUnit } from "./types";
import { callStructured } from "./gemini";

// ---------------------------------------------------------------------------
// JSON Schema for Gemini structured output
// ---------------------------------------------------------------------------

const PROPOSITION_SCHEMA = {
  type: "object",
  properties: {
    propositions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },

          // Human-readable contextual label.
          topic: { type: "string" },

          // Complete semantic meaning of the proposition.
          statement: { type: "string" },

          // IMPORTANT:
          // Stable semantic subject / field / concept.
          //
          // Examples:
          // "name"
          // "school"
          // "employer"
          // "eligibility criteria"
          // "interest rate"
          // "submission deadline"
          // "coverage limit"
          subject: { type: "string" },

          eligibilityCondition: { type: "string" },
          benefit: { type: "string" },
          amount: { type: "string" },
          amountRaw: { type: "string" },
          unit: { type: "string" },
          period: { type: "string" },
          submissionCondition: { type: "string" },
          procedure: { type: "string" },
          exception: { type: "string" },
          definition: { type: "string" },
          effectiveDate: { type: "string" },
          geographicScope: { type: "string" },

          source: {
            type: "object",
            properties: {
              page: { type: "integer" },
              section: { type: "string" },
              originalText: { type: "string" },
            },
            required: ["page", "originalText"],
          },

          extractionConfidence: { type: "number" },
        },

        required: [
          "id",
          "topic",
          "statement",
          "subject",
          "source",
          "extractionConfidence",
        ],
      },
    },
  },

  required: ["propositions"],
};

// ---------------------------------------------------------------------------
// Extraction system prompt
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a precise semantic content extractor for document comparison.

Your task is to extract ALL meaningful propositions from the document text provided.

A "proposition" is any meaningful claim, rule, policy, procedure, requirement, eligibility condition, definition, monetary limit, rate, deadline, percentage, or factual statement made by the document.

The extracted propositions will later be compared against propositions from another version of the document.

The most important requirement is that each proposition must identify its STABLE SEMANTIC SUBJECT.

A semantic subject is the underlying field, fact, concept, rule, or property being described.

For example:

Previous:
"Name: Rahul Kumar"

Current:
"Name: Santhosh Mohan"

Both should have:

subject: "name"

The VALUE is different, but the underlying subject is the same.

Another example:

Previous:
"School: ABC Engineering College"

Current:
"School: Easwari Engineering College"

Both should have:

subject: "school"

Another example:

Previous:
"Company: Google"

Current:
"Company: Microsoft"

Both should have:

subject: "employer"

Another example:

Previous:
"Interest rate: 8.5%"

Current:
"Interest rate: 9%"

Both should have:

subject: "interest rate"

The subject identifies WHAT the proposition is about.
The statement describes the COMPLETE meaning and current value/content.

EXTRACTION RULES:

1. Extract EVERY meaningful piece of information as its own proposition.

2. Tightly related sub-parts that together form one coherent fact or policy
   should be ONE proposition.

3. Do NOT merge unrelated propositions from different topics.

4. Every proposition MUST have a stable semantic "subject".

5. The subject should describe the underlying concept rather than merely
   copying the wording of the sentence.

6. Keep the same semantic subject when two different values could be compared
   across document versions.

7. Do NOT put the actual changing value into the subject when the value is
   the thing being compared.

   BAD:
   subject: "Rahul Kumar"

   GOOD:
   subject: "name"

8. For a person's education:

   BAD:
   subject: "ABC Engineering College"

   GOOD:
   subject: "school"

9. For employment:

   BAD:
   subject: "Google"

   GOOD:
   subject: "employer"

10. For a job position:

   subject: "job title"

11. For contact information:

   subject: "email"
   subject: "phone number"
   subject: "location"

12. For policy documents, use semantic concepts such as:

   subject: "eligibility criteria"
   subject: "benefit"
   subject: "coverage limit"
   subject: "interest rate"
   subject: "submission deadline"
   subject: "procedure"
   subject: "exception"
   subject: "geographic scope"
   subject: "effective date"

13. The same underlying subject should be used even if the document uses
    different terminology.

14. The source.originalText field MUST contain the verbatim, unmodified text
    from the document that supports this proposition.

15. Do NOT invent, infer, or add information beyond what the text explicitly
    states.

16. Record the page number accurately from the [Page N] markers.

17. Include the section heading in source.section when identifiable.

18. Use "topic" as a short (<=10 words) contextual label.

19. Use "statement" to summarize the FULL meaning accurately and completely.
    Preserve the actual value/content described by the document.

20. Populate structured fields (amount, unit, submissionCondition, etc.)
    ONLY when explicitly stated.

21. For amounts, populate amountRaw with the EXACT text
    (for example "₹20,000" or "INR 500").

22. Do not treat formatting, wording, section placement, or synonymous
    terminology as a semantic difference.

CAPTURE:

- factual identity information
- names
- organizations
- schools and institutions
- education
- qualifications
- job titles
- employers
- skills
- projects
- certifications
- dates
- monetary amounts
- monetary limits
- percentages
- rates
- time periods
- deadlines
- eligibility criteria
- procedures
- requirements
- obligations
- prohibitions
- restrictions
- exceptions
- definitions
- geographic scope
- organizational scope

SKIP:

- page headers and footers
- page numbers
- table-of-contents entries
- blank headings with no content
- standard legal signatures

Assign unique sequential IDs using the prefix provided.`;


// ---------------------------------------------------------------------------
// Chunking helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE_PAGES = 10;
const CHUNK_OVERLAP_PAGES = 1;

interface PageChunk {
  pages: Array<{ pageNumber: number; text: string }>;
  startPage: number;
  endPage: number;
}

function chunkDocument(doc: DocumentPages): PageChunk[] {
  if (doc.pages.length <= CHUNK_SIZE_PAGES) {
    return [
      {
        pages: doc.pages,
        startPage: doc.pages[0]?.pageNumber ?? 1,
        endPage: doc.pages[doc.pages.length - 1]?.pageNumber ?? 1,
      },
    ];
  }

  const chunks: PageChunk[] = [];
  let i = 0;

  while (i < doc.pages.length) {
    const end = Math.min(i + CHUNK_SIZE_PAGES, doc.pages.length);
    const slice = doc.pages.slice(i, end);

    chunks.push({
      pages: slice,
      startPage: slice[0].pageNumber,
      endPage: slice[slice.length - 1].pageNumber,
    });

    i += CHUNK_SIZE_PAGES - CHUNK_OVERLAP_PAGES;
  }

  return chunks;
}


// ---------------------------------------------------------------------------
// Cross-chunk deduplication
// ---------------------------------------------------------------------------

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isSimilarOriginalText(a: string, b: string): boolean {
  const na = normalizeForDedup(a);
  const nb = normalizeForDedup(b);

  if (na === nb) return true;

  if (na.length < 20 || nb.length < 20) return false;

  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;

  if (longer.includes(shorter)) return true;

  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));

  const inter = new Set(
    Array.from(wa).filter((w) => wb.has(w))
  );

  const union = new Set([
    ...Array.from(wa),
    ...Array.from(wb),
  ]);

  return inter.size / union.size >= 0.85;
}

function deduplicatePropositions(
  props: PropositionUnit[]
): PropositionUnit[] {
  const seen: PropositionUnit[] = [];

  for (const p of props) {
    const normalizedSubject = normalizeForDedup(
      p.subject ?? ""
    );

    const isDup = seen.some(
      (s) =>
        isSimilarOriginalText(
          s.source.originalText,
          p.source.originalText
        ) ||
        (
          normalizeForDedup(s.subject ?? "") === normalizedSubject &&
          normalizeForDedup(s.statement) ===
            normalizeForDedup(p.statement)
        )
    );

    if (!isDup) {
      seen.push(p);
    }
  }

  return seen;
}


// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

export async function extractPropositions(
  doc: DocumentPages,
  docRole: "previous" | "current"
): Promise<PropositionUnit[]> {
  const prefix = docRole === "previous" ? "prev" : "curr";
  const chunks = chunkDocument(doc);

  const allProps: PropositionUnit[] = [];
  let idCounter = 1;

  for (const chunk of chunks) {
    const chunkText = chunk.pages
      .map(
        (p) =>
          `[Page ${p.pageNumber}]\n${p.text}`
      )
      .join("\n\n");

    const userPrompt = `Extract all meaningful propositions from the document text below.

ID prefix: "${prefix}_"
Start numbering at ${idCounter}.

IMPORTANT:
For every proposition, identify the STABLE SEMANTIC SUBJECT.

If the document says:

"Name: Rahul Kumar"

the subject should be "name", not "Rahul Kumar".

If the document says:

"School: ABC Engineering College"

the subject should be "school", not "ABC Engineering College".

If the document says:

"Company: Google"

the subject should normally be "employer" or another stable semantic subject describing the employment field.

The subject must identify what is being described, not the value of that field.

DOCUMENT TEXT:
---
${chunkText}
---`;

    try {
      const result = await callStructured<{
        propositions: PropositionUnit[];
      }>(
        EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        PROPOSITION_SCHEMA
      );

      const validated = (result.propositions ?? [])
        .filter(
          (p) =>
            p.topic?.trim() &&
            p.statement?.trim() &&
            p.subject?.trim() &&
            p.source?.originalText?.trim()
        )
        .map((p) => ({
          ...p,

          // Always assign our own IDs.
          id: `${prefix}_${idCounter++}`,

          // Keep extraction confidence bounded.
          extractionConfidence: Math.min(
            1,
            Math.max(
              0,
              p.extractionConfidence ?? 0.7
            )
          ),

          // Normalize subject whitespace while preserving
          // Gemini's semantic label.
	  subject: p.subject?.trim() ?? "",
        }));

      allProps.push(...validated);
    } catch (err) {
      console.error(
        `[extractor] Chunk pages ${chunk.startPage}–${chunk.endPage} failed:`,
        err
      );

      // IMPORTANT:
      // Never turn a Gemini failure into an empty proposition list.
      // Propagate the error so the API can return the actual AI failure
      // instead of falsely reporting "No meaningful differences".
      throw err;
    }
  }

  return deduplicatePropositions(allProps);
}