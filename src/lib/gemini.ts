import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Model name — NEVER hardcoded, always read from environment
// ---------------------------------------------------------------------------

export const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. " +
          "Copy .env.local.example to .env.local and add your API key."
      );
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly code: "RATE_LIMIT" | "INVALID_RESPONSE" | "API_ERROR",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

// ---------------------------------------------------------------------------
// Exponential back-off retry
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = String((err as { message?: string })?.message ?? "");
      const isRateLimit =
        (err as { status?: number })?.status === 429 ||
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("quota");

      if (isRateLimit) {
        if (attempt < maxAttempts - 1) {
          const delayMs = Math.pow(2, attempt) * 1500;
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw new GeminiError("Rate limit exceeded after retries", "RATE_LIMIT", err);
      }

      // Non-rate-limit errors are not retried
      throw new GeminiError(
        msg || "Unknown Gemini API error",
        "API_ERROR",
        err
      );
    }
  }
  throw new GeminiError("Max retries exceeded", "API_ERROR", lastError);
}

// ---------------------------------------------------------------------------
// Structured output call — returns parsed JSON object
// ---------------------------------------------------------------------------

export async function callStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>
): Promise<T> {
  const client = getClient();

  return withRetry(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction = await (client.interactions as any).create({
      model: MODEL,
      store: false,
      system_instruction: systemPrompt,
      input: userPrompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema,
      },
    });

    const text: string = interaction.output_text ?? "";
    if (!text.trim()) {
      throw new GeminiError("Empty response from model", "INVALID_RESPONSE");
    }

    // Strip markdown code fences the model sometimes adds
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      throw new GeminiError(
        `Failed to parse model response as JSON. Preview: ${cleaned.slice(0, 300)}`,
        "INVALID_RESPONSE",
        e
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Plain text call
// ---------------------------------------------------------------------------

export async function callText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = getClient();

  return withRetry(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction = await (client.interactions as any).create({
      model: MODEL,
      store: false,
      system_instruction: systemPrompt,
      input: userPrompt,
    });

    const text: string = interaction.output_text ?? "";
    if (!text.trim()) {
      throw new GeminiError("Empty response from model", "INVALID_RESPONSE");
    }
    return text.trim();
  });
}
