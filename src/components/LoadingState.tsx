"use client";

interface Props {
  currentStep: string;
  currentStepIndex: number;
}

const STEPS = [
  "Uploading documents",
  "Extracting text",
  "Understanding content",
  "Matching related sections",
  "Comparing meanings",
  "Validating evidence",
  "Generating report",
];

export default function LoadingState({
  currentStep,
  currentStepIndex,
}: Props) {
  const currentIndex = Math.min(
    Math.max(currentStepIndex, 0),
    STEPS.length - 1
  );

  return (
    <div className="mx-auto max-w-3xl py-12 sm:py-20">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/[0.04]">
        {/* Top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500" />

        <div className="p-7 sm:p-10">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-indigo-100/60 blur-xl" />

              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 shadow-lg shadow-slate-950/15">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-7 w-7 text-white"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.5 3.5h7L18.5 8v12.5H6.5A2.5 2.5 0 0 1 4 18V6a2.5 2.5 0 0 1 2.5-2.5Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 3.5V8h5"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h7M8 15.5h4"
                  />
                </svg>

                <div className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-white bg-indigo-500">
                  <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400 opacity-50" />
                </div>
              </div>
            </div>

            <h2 className="mt-6 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Analyzing your documents
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Looking for meaningful changes, not superficial differences.
            </p>
          </div>

          {/* Current operation */}
          <div className="mt-9 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">
                  Current operation
                </p>

                <p className="mt-0.5 truncate text-sm font-medium text-slate-700">
                  {currentStep}
                </p>
              </div>
            </div>
          </div>

          {/* Processing pipeline */}
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Analysis pipeline
              </p>

              <p className="text-xs font-medium text-slate-400">
                Step {currentIndex + 1} of {STEPS.length}
              </p>
            </div>

            <div className="space-y-1">
              {STEPS.map((step, index) => {
                const completed = index < currentIndex;
                const active = index === currentIndex;

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 ${
                      active
                        ? "bg-slate-50"
                        : completed
                          ? "opacity-70"
                          : "opacity-35"
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                        completed
                          ? "bg-emerald-50 text-emerald-600"
                          : active
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                            : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {completed ? (
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-3.5 w-3.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m5 10 3 3 7-7"
                          />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>

                    <span
                      className={`text-sm ${
                        active
                          ? "font-semibold text-slate-800"
                          : completed
                            ? "text-slate-500"
                            : "text-slate-400"
                      }`}
                    >
                      {step}
                    </span>

                    {active && (
                      <span className="ml-auto flex gap-0.5">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-400" />
                        <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-400 [animation-delay:150ms]" />
                        <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-400 [animation-delay:300ms]" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-xs leading-5 text-slate-400">
              Semantic analysis may take 30–90 seconds depending on document
              length.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}