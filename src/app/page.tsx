"use client";

import { useState } from "react";
import type { ComparisonResult, ComparisonError } from "@/lib/types";
import DocumentUploader from "@/components/DocumentUploader";
import LoadingState from "@/components/LoadingState";
import DifferenceSummary from "@/components/DifferenceSummary";
import ComparisonView from "@/components/ComparisonView";

type AppState = "idle" | "loading" | "result" | "error";

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState<string>("Uploading documents…");

  const LOADING_STEPS = [
    "Uploading documents…",
    "Extracting text from PDFs…",
    "Identifying semantic propositions…",
    "Matching related content…",
    "Comparing meanings…",
    "Validating evidence…",
    "Generating report…",
  ];

  async function handleCompare(previousFile: File, currentFile: File) {
    setAppState("loading");
    setErrorMessage("");
    setResult(null);

    // Animate loading steps
    let stepIndex = 0;
    setLoadingStep(LOADING_STEPS[0]);
    const stepInterval = setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, LOADING_STEPS.length - 1);
      setLoadingStep(LOADING_STEPS[stepIndex]);
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
        setErrorMessage(errData.error ?? "An unknown error occurred.");
        setAppState("error");
        return;
      }

      setResult(data as ComparisonResult);
      setAppState("result");
    } catch (err: unknown) {
      clearInterval(stepInterval);
      const msg = (err as { message?: string })?.message ?? "Network error";
      setErrorMessage(`Failed to reach the server: ${msg}`);
      setAppState("error");
    }
  }

  function handleReset() {
    setAppState("idle");
    setResult(null);
    setErrorMessage("");
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Document Difference Analyzer
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          Upload two versions of a PDF document. The AI will identify only{" "}
          <span className="font-semibold text-gray-700">meaningful changes</span>
          {" "}— not formatting, synonyms, or reordering.
        </p>
      </div>

      {/* Upload panel (always visible unless loading or result) */}
      {(appState === "idle" || appState === "error") && (
        <div className="space-y-4">
          <DocumentUploader onCompare={handleCompare} />
          {appState === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="font-semibold">Error: </span>
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {appState === "loading" && <LoadingState currentStep={loadingStep} />}

      {/* Results */}
      {appState === "result" && result && (
        <div className="space-y-6">
          <DifferenceSummary summary={result.summary} onReset={handleReset} />
          {result.processingNotes && result.processingNotes.length > 0 && (
            <details className="text-xs text-gray-400 border border-gray-200 rounded-lg p-3 cursor-pointer">
              <summary className="font-medium">Processing notes ({result.processingNotes.length})</summary>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                {result.processingNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </details>
          )}
          <ComparisonView differences={result.differences} />
        </div>
      )}
    </main>
  );
}

