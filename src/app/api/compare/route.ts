import { type NextRequest, NextResponse } from "next/server";
import type { ComparisonResult, ComparisonError } from "@/lib/types";
import { parseDocument, ParseError } from "@/lib/documentParser";
import { extractPropositions } from "@/lib/extractor";
import { normalizeUnits } from "@/lib/normalizer";
import { matchPropositions } from "@/lib/semanticMatcher";
import { compareMatchedPairs } from "@/lib/comparator";
import { validateAll } from "@/lib/evidenceValidator";
import { generateReport } from "@/lib/reportGenerator";
import { GeminiError } from "@/lib/gemini";

export const runtime = "nodejs";

// Max body size is controlled by Next.js; we enforce per-file limit in parseDocument.
// Set Next.js body size limit if needed via next.config.ts (serverActionsBodySizeLimit).

function errorResponse(
  error: string,
  code: ComparisonError["code"],
  status: number,
  details?: string
): NextResponse<ComparisonError> {
  return NextResponse.json({ error, code, details }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse<ComparisonResult | ComparisonError>> {
  // ── 1. Parse multipart form data ─────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Failed to parse request body", "PARSE_ERROR", 400);
  }

  const previousFile = formData.get("previous");
  const currentFile = formData.get("current");

  if (!previousFile || !currentFile) {
    return errorResponse(
      "Both 'previous' and 'current' PDF files are required.",
      "MISSING_FILE",
      400
    );
  }

  if (!(previousFile instanceof File) || !(currentFile instanceof File)) {
    return errorResponse("Uploaded values must be files.", "MISSING_FILE", 400);
  }

  // ── 2. Validate MIME types ───────────────────────────────────────────────
  const ALLOWED_TYPES = ["application/pdf", "application/x-pdf"];

  const prevType = previousFile.type?.toLowerCase() || "";
  const currType = currentFile.type?.toLowerCase() || "";

  if (!ALLOWED_TYPES.includes(prevType) && !previousFile.name.endsWith(".pdf")) {
    return errorResponse(
      "The 'previous' file must be a PDF.",
      "INVALID_FILE_TYPE",
      415
    );
  }
  if (!ALLOWED_TYPES.includes(currType) && !currentFile.name.endsWith(".pdf")) {
    return errorResponse(
      "The 'current' file must be a PDF.",
      "INVALID_FILE_TYPE",
      415
    );
  }

  // ── 3. Convert files to Buffers ──────────────────────────────────────────
  let prevBuffer: Buffer;
  let currBuffer: Buffer;
  try {
    prevBuffer = Buffer.from(await previousFile.arrayBuffer());
    currBuffer = Buffer.from(await currentFile.arrayBuffer());
  } catch {
    return errorResponse("Failed to read uploaded files.", "PARSE_ERROR", 400);
  }

  // ── 4. Parse PDFs ────────────────────────────────────────────────────────
  let prevPages, currPages;
  try {
    [prevPages, currPages] = await Promise.all([
      parseDocument(prevBuffer),
      parseDocument(currBuffer),
    ]);
  } catch (err) {
    if (err instanceof ParseError) {
      const codeMap: Record<ParseError["code"], ComparisonError["code"]> = {
        EMPTY_DOCUMENT: "EMPTY_DOCUMENT",
        CORRUPT_PDF: "CORRUPT_PDF",
        FILE_TOO_LARGE: "FILE_TOO_LARGE",
      };
      return errorResponse(err.message, codeMap[err.code], 422);
    }
    return errorResponse("Failed to parse one or both PDFs.", "CORRUPT_PDF", 422);
  }

  // ── 5. Extract propositions ──────────────────────────────────────────────
  let prevPropositions, currPropositions;
  try {
    [prevPropositions, currPropositions] = await Promise.all([
      extractPropositions(prevPages, "previous"),
      extractPropositions(currPages, "current"),
    ]);
  } catch (err) {
    if (err instanceof GeminiError) {
      return errorResponse(
        err.code === "RATE_LIMIT"
          ? "AI rate limit reached. Please wait a moment and try again."
          : `AI extraction error: ${err.message}`,
        err.code === "RATE_LIMIT" ? "RATE_LIMIT" : "GEMINI_ERROR",
        err.code === "RATE_LIMIT" ? 429 : 502
      );
    }
    return errorResponse("Semantic extraction failed.", "GEMINI_ERROR", 502);
  }

  // ── 6. Normalize ─────────────────────────────────────────────────────────
  const prevNormalized = normalizeUnits(prevPropositions);
  const currNormalized = normalizeUnits(currPropositions);

  // ── 7. Semantic matching ─────────────────────────────────────────────────
  let matchResult;
  try {
    matchResult = await matchPropositions(prevNormalized, currNormalized);
  } catch (err) {
    if (err instanceof GeminiError) {
      return errorResponse(
        `AI matching error: ${err.message}`,
        err.code === "RATE_LIMIT" ? "RATE_LIMIT" : "GEMINI_ERROR",
        err.code === "RATE_LIMIT" ? 429 : 502
      );
    }
    return errorResponse("Semantic matching failed.", "GEMINI_ERROR", 502);
  }

  // ── 8. Comparison ────────────────────────────────────────────────────────
  let classifiedItems;
  try {
    classifiedItems = await compareMatchedPairs(
      matchResult.matched,
      matchResult.unmatchedPrevious,
      matchResult.unmatchedCurrent
    );
  } catch (err) {
    if (err instanceof GeminiError) {
      return errorResponse(
        `AI comparison error: ${err.message}`,
        err.code === "RATE_LIMIT" ? "RATE_LIMIT" : "GEMINI_ERROR",
        err.code === "RATE_LIMIT" ? 429 : 502
      );
    }
    return errorResponse("Comparison failed.", "GEMINI_ERROR", 502);
  }

  // ── 9. Evidence validation ───────────────────────────────────────────────
  const { validated, processingNotes } = validateAll(classifiedItems, prevPages, currPages);

  // ── 10. Report generation ────────────────────────────────────────────────
  let differences;
  try {
    differences = await generateReport(validated);
  } catch (err) {
    if (err instanceof GeminiError) {
      return errorResponse(
        `AI report generation error: ${err.message}`,
        err.code === "RATE_LIMIT" ? "RATE_LIMIT" : "GEMINI_ERROR",
        err.code === "RATE_LIMIT" ? 429 : 502
      );
    }
    return errorResponse("Report generation failed.", "GEMINI_ERROR", 502);
  }

  // ── 11. Build summary ────────────────────────────────────────────────────
  const summary = {
    changed: differences.filter((d) => d.type === "changed").length,
    new: differences.filter((d) => d.type === "new").length,
    removed: differences.filter((d) => d.type === "removed").length,
    unchanged: validated.filter((v) => v.type === "unchanged").length,
  };

  const result: ComparisonResult = {
    summary,
    differences,
    processingNotes: processingNotes.length > 0 ? processingNotes : undefined,
  };

  return NextResponse.json(result, { status: 200 });
}
