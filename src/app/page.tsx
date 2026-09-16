"use client";

import { useState } from "react";
import type { ComparisonResult, ComparisonError } from "@/lib/types";
import DocumentUploader from "@/components/DocumentUploader";
import LoadingState from "@/components/LoadingState";
import DifferenceSummary from "@/components/DifferenceSummary";
import ComparisonView from "@/components/ComparisonView";

type AppState = "idle" | "loading" | "result" | "error";

const LOADING_STEPS = [
  "Uploading documents…",
  "Extracting text from PDFs…",
  "Identifying semantic propositions…",
  "Matching related content…",
  "Comparing meanings…",
  "Validating evidence…",
  "Generating report…",
];

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState<string>(
    LOADING_STEPS[0]
  );
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  async function handleCompare(
    previousFile: File,
    currentFile: File
  ) {
    setAppState("loading");
    setErrorMessage("");
    setResult(null);

    let stepIndex = 0;

    setLoadingStep(LOADING_STEPS[0]);
    setLoadingStepIndex(0);

    const stepInterval = setInterval(() => {
      stepIndex = Math.min(
        stepIndex + 1,
        LOADING_STEPS.length - 1
      );

      setLoadingStep(LOADING_STEPS[stepIndex]);
      setLoadingStepIndex(stepIndex);
    }, 4000);

    try {
      const formData = new FormData();

      formData.append("previous", previousFile);
      formData.append("current", currentFile);

      const response = await fetch("/api/compare", {
        method: "POST",
        body: formData,
      });

      clearInterval(stepInterval);

      const data = await response.json();

      if (!response.ok) {
        const errData = data as ComparisonError;

        setErrorMessage(
          errData.error ?? "An unknown error occurred."
        );

        setAppState("error");
        return;
      }

      setResult(data as ComparisonResult);
      setAppState("result");
    } catch (err: unknown) {
      clearInterval(stepInterval);

      const msg =
        (err as { message?: string })?.message ??
        "Network error";

      setErrorMessage(
        `Failed to reach the server: ${msg}`
      );

      setAppState("error");
    }
  }

  function handleReset() {
    setAppState("idle");
    setResult(null);
    setErrorMessage("");
    setLoadingStep(LOADING_STEPS[0]);
    setLoadingStepIndex(0);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-900">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-200/20 blur-3xl" />

        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-violet-200/10 blur-3xl" />

        <div className="absolute bottom-0 -right-40 h-96 w-96 rounded-full bg-blue-200/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        {/* Top bar */}
        <header className="mb-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 3.5h7.5L19 8v12.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z"
                />

                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 3.5V8h5"
                />

                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.5 12h6.5M8.5 15.5h4"
                />
              </svg>
            </div>

            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-950">
                Difference Analyzer
              </div>

              <div className="text-xs text-slate-500">
                Semantic document comparison
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm backdrop-blur sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AI-powered analysis
          </div>
        </header>

        {/* Hero */}
        {(appState === "idle" || appState === "error") && (
          <section className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M10 1.75a.75.75 0 0 1 .75.75v1.13a6.38 6.38 0 0 1 4.62 4.62h1.13a.75.75 0 0 1 0 1.5h-1.13a6.38 6.38 0 0 1-4.62 4.62v1.13a.75.75 0 0 1-1.5 0v-1.13a6.38 6.38 0 0 1-4.62-4.62H3.5a.75.75 0 0 1 0-1.5h1.13a6.38 6.38 0 0 1 4.62-4.62V2.5a.75.75 0 0 1 .75-.75Z" />
              </svg>

              Understand changes, not just text
            </div>

            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-6xl">
              Compare documents with
              <span className="block bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 bg-clip-text text-transparent">
                semantic precision.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg">
              Upload two versions of a document and uncover the
              changes that actually matter. Formatting, wording,
              synonyms, and reordered content are intelligently
              ignored.
            </p>
          </section>
        )}

        {/* Main content */}
        {appState === "idle" || appState === "error" ? (
          <section className="mx-auto max-w-4xl">
            <DocumentUploader onCompare={handleCompare} />

            {appState === "error" && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 shadow-sm">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM10 5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <div>
                  <span className="font-semibold">
                    Something went wrong.
                  </span>{" "}
                  {errorMessage}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* Loading */}
        {appState === "loading" && (
          <section className="mx-auto max-w-4xl">
            <LoadingState
              currentStep={loadingStep}
              currentStepIndex={loadingStepIndex}
            />
          </section>
        )}

        {/* Results */}
        {appState === "result" && result && (
          <section className="space-y-7">
            <DifferenceSummary
              summary={result.summary}
              onReset={handleReset}
            />

            {result.processingNotes &&
              result.processingNotes.length > 0 && (
                <details className="group rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-500 shadow-sm backdrop-blur">
                  <summary className="cursor-pointer list-none font-medium text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>
                        Processing notes (
                        {result.processingNotes.length})
                      </span>

                      <span className="transition-transform group-open:rotate-180">
                        ↓
                      </span>
                    </div>
                  </summary>

                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    {result.processingNotes.map(
                      (note, i) => (
                        <li key={i} className="pl-1">
                          {note}
                        </li>
                      )
                    )}
                  </ul>
                </details>
              )}

            <ComparisonView
              differences={result.differences}
            />
          </section>
        )}

        {/* Footer */}
        <footer className="mt-20 border-t border-slate-200/70 pt-6 text-center text-xs text-slate-400">
          Meaningful changes only · Evidence-backed comparison
        </footer>
      </div>
    </main>
  );
}