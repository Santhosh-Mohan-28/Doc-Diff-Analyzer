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
          topic: { type: "string" },
          statement: { type: "string" },
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
        required: ["id", "topic", "statement", "source", "extractionConfidence"],
      },
    },
  },
  required: ["propositions"],
};

// ---------------------------------------------------------------------------
// Extraction system prompt
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a precise semantic content extractor for document comparison.

Your task: Extract ALL meaningful propositions from the document text provided.

A "proposition" is any meaningful claim, rule, policy, procedure, requirement, eligibility condition, definition, monetary limit, rate, deadline, percentage, or factual statement made by the document.

EXTRACTION RULES:
1. Extract EVERY meaningful piece of information as its own proposition.
2. Tightly related sub-parts that together form one policy (e.g. a benefit + its eligibility + its deadline) should be ONE proposition.
3. Do NOT merge unrelated propositions from different topics.
4. The source.originalText field MUST contain the verbatim, unmodified text from the document that supports this proposition. Do not rephrase or shorten it.
5. Do NOT invent, infer, or add information beyond what the text explicitly states.
6. Record the page number accurately from the [Page N] markers.
7. Include the section heading in source.section when identifiable.
8. Use "topic" as a short (≤10 words) plain-language label.
9. Use "statement" to summarise the FULL meaning accurately and completely.
10. Populate structured fields (amount, unit, submissionCondition, etc.) ONLY when explicitly stated.
11. For amounts, populate amountRaw with the EXACT text (e.g. "₹20,000", "INR 500").

CAPTURE: monetary amounts/limits, time periods/deadlines, eligibility criteria, procedures, requirements, obligations, prohibitions, restrictions, exceptions, definitions, dates, percentages, rates, geographic/org scope.

SKIP: page headers/footers, page numbers, table-of-contents entries, blank headings with no content, standard legal signatures.

Assign unique sequential IDs using the prefix provided.`;

// ---------------------------------------------------------------------------
// Chunking helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE_PAGES = 10;
const CHUNK_OVERLAP_PAGES = 1; // one-page overlap prevents boundary splits

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
  // Jaccard on words
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  const inter = new Set(Array.from(wa).filter((w) => wb.has(w)));
  const union = new Set([...Array.from(wa), ...Array.from(wb)]);
  return inter.size / union.size >= 0.85;
}

function deduplicatePropositions(props: PropositionUnit[]): PropositionUnit[] {
  const seen: PropositionUnit[] = [];
  for (const p of props) {
    const isDup = seen.some(
      (s) =>
        isSimilarOriginalText(s.source.originalText, p.source.originalText) ||
        (s.topic === p.topic && normalizeForDedup(s.statement) === normalizeForDedup(p.statement))
    );
    if (!isDup) seen.push(p);
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
      .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
      .join("\n\n");

    const userPrompt = `Extract all meaningful propositions from the document text below.
ID prefix: "${prefix}_", start numbering at ${idCounter}.

DOCUMENT TEXT:
---
${chunkText}
---`;

    try {
      const result = await callStructured<{ propositions: PropositionUnit[] }>(
        EXTRACTION_SYSTEM_PROMPT,
        userPrompt,
        PROPOSITION_SCHEMA
      );

      const validated = (result.propositions ?? [])
        .filter((p) => p.topic?.trim() && p.statement?.trim() && p.source?.originalText?.trim())
        .map((p) => ({
          ...p,
          id: `${prefix}_${idCounter++}`,
          extractionConfidence: Math.min(1, Math.max(0, p.extractionConfidence ?? 0.7)),
        }));

      allProps.push(...validated);
    } catch (err) {
      console.error(
        `[extractor] Chunk pages ${chunk.startPage}–${chunk.endPage} failed:`,
        err
      );
      // Continue with remaining chunks rather than aborting the whole extraction
    }
  }

  return deduplicatePropositions(allProps);
}

