"use client";

interface Props {
  currentStep: string;
}

export default function LoadingState({ currentStep }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
      {/* Spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
      </div>

      <div className="space-y-1">
        <p className="text-lg font-semibold text-gray-800">Analyzing Documents</p>
        <p className="text-sm text-gray-500 max-w-sm animate-pulse">{currentStep}</p>
      </div>

      <p className="text-xs text-gray-400 max-w-xs">
        Semantic analysis may take 30–90 seconds depending on document length.
      </p>
    </div>
  );
}
