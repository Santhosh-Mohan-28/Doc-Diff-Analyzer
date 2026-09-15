import type { DocumentPages, DocumentPage } from "./types";

// Server-only module — never import from client components.
// pdf-parse is declared as serverExternalPackage in next.config.ts.

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: "EMPTY_DOCUMENT" | "CORRUPT_PDF" | "FILE_TOO_LARGE"
  ) {
    super(message);
    this.name = "ParseError";
  }
}

// ---------------------------------------------------------------------------
// Main parse function — returns page-aware document structure.
// Source originalText is NEVER rewritten or normalised here;
// normalisation happens only on extracted semantic units downstream.
// ---------------------------------------------------------------------------

export async function parseDocument(buffer: Buffer): Promise<DocumentPages> {
  if (buffer.length === 0) {
    throw new ParseError("The uploaded document is empty.", "EMPTY_DOCUMENT");
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ParseError(
      `File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds the 20 MB limit.`,
      "FILE_TOO_LARGE"
    );
  }

  // Validate PDF magic bytes
  const header = buffer.slice(0, 4).toString("ascii");
  if (!header.startsWith("%PDF")) {
    throw new ParseError(
      "The file does not appear to be a valid PDF.",
      "CORRUPT_PDF"
    );
  }

  // Dynamic import ensures this never runs on the client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = (await import("pdf-parse")).default;

  const pages: DocumentPage[] = [];
  let pageCounter = 0;

  // pagerender callback — called once per page by pdf-parse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPage = async (pageData: any): Promise<string> => {
    pageCounter++;
    const currentPage = pageCounter;
    try {
      const textContent = await pageData.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageText: string = textContent.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => (typeof item.str === "string" ? item.str : ""))
        .join(" ")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      pages.push({ pageNumber: currentPage, text: pageText });
      return pageText;
    } catch {
      // If a single page fails, record an empty page; don't abort the whole document
      pages.push({ pageNumber: currentPage, text: "" });
      return "";
    }
  };

  try {
    const result = await pdfParse(buffer, { pagerender: renderPage });

    // Fallback: if pagerender callback never fired (some pdf-parse builds skip it),
    // split on form-feed characters that pdf.js inserts between pages
    if (pages.length === 0) {
      const rawText: string = result.text ?? "";
      const ffPages = rawText.split("\f").filter((p) => p.trim().length > 0);
      if (ffPages.length > 1) {
        ffPages.forEach((text, i) => {
          pages.push({
            pageNumber: i + 1,
            text: text.replace(/[ \t]{2,}/g, " ").trim(),
          });
        });
      } else {
        const text = rawText.replace(/[ \t]{2,}/g, " ").trim();
        if (text.length > 0) {
          pages.push({ pageNumber: 1, text });
        }
      }
    }

    if (pages.length === 0) {
      throw new ParseError(
        "No text content could be extracted. The PDF may be scanned or image-based.",
        "EMPTY_DOCUMENT"
      );
    }

    // Remove pages that are entirely blank (headers/footers only)
    const meaningfulPages = pages.filter((p) => p.text.trim().length > 10);
    const finalPages = meaningfulPages.length > 0 ? meaningfulPages : pages;

    return {
      pages: finalPages,
      totalPages: finalPages.length,
      fullText: finalPages.map((p) => p.text).join("\n\n"),
    };
  } catch (err: unknown) {
    if (err instanceof ParseError) throw err;
    const msg = (err as { message?: string })?.message ?? "Unknown error";
    throw new ParseError(`Failed to parse PDF: ${msg}`, "CORRUPT_PDF");
  }
}
