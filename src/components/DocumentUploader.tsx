"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  onCompare: (previous: File, current: File) => void;
  disabled?: boolean;
}

interface SlotState {
  file: File | null;
  dragging: boolean;
}

function FileSlot({
  label,
  description,
  file,
  dragging,
  onFile,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
}: {
  label: string;
  description: string;
  file: File | null;
  dragging: boolean;
  onFile: (f: File) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer
        ${dragging ? "border-blue-500 bg-blue-50" : file ? "border-green-400 bg-green-50" : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      aria-label={`Upload ${label} PDF`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleInputChange}
      />
      {file ? (
        <div className="text-center space-y-1">
          <div className="text-green-600 text-2xl">✓</div>
          <p className="font-medium text-green-700 text-sm truncate max-w-[200px]">{file.name}</p>
          <p className="text-xs text-green-600">{(file.size / 1024).toFixed(0)} KB</p>
          <p className="text-xs text-gray-400 mt-1">Click to replace</p>
        </div>
      ) : (
        <div className="text-center space-y-2">
          <div className="text-gray-300 text-4xl">📄</div>
          <p className="font-semibold text-gray-700 text-sm">{label}</p>
          <p className="text-xs text-gray-400">{description}</p>
          <p className="text-xs text-gray-300">PDF only · max 20 MB</p>
        </div>
      )}
    </div>
  );
}

export default function DocumentUploader({ onCompare, disabled }: Props) {
  const [prev, setPrev] = useState<SlotState>({ file: null, dragging: false });
  const [curr, setCurr] = useState<SlotState>({ file: null, dragging: false });
  const prevInputRef = useRef<HTMLInputElement>(null);
  const currInputRef = useRef<HTMLInputElement>(null);

  const makeDropHandler = useCallback(
    (setter: React.Dispatch<React.SetStateAction<SlotState>>) =>
      (e: React.DragEvent) => {
        e.preventDefault();
        setter((s) => ({ ...s, dragging: false }));
        const f = e.dataTransfer.files?.[0];
        if (f && (f.type === "application/pdf" || f.name.endsWith(".pdf"))) {
          setter((s) => ({ ...s, file: f }));
        }
      },
    []
  );

  const handleSubmit = () => {
    if (prev.file && curr.file) {
      onCompare(prev.file, curr.file);
    }
  };

  const ready = !!(prev.file && curr.file) && !disabled;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FileSlot
          label="Previous Version"
          description="Drag & drop or click to browse"
          file={prev.file}
          dragging={prev.dragging}
          onFile={(f) => setPrev((s) => ({ ...s, file: f }))}
          onDragOver={(e) => { e.preventDefault(); setPrev((s) => ({ ...s, dragging: true })); }}
          onDragLeave={() => setPrev((s) => ({ ...s, dragging: false }))}
          onDrop={makeDropHandler(setPrev)}
          inputRef={prevInputRef}
        />
        <FileSlot
          label="Current Version"
          description="Drag & drop or click to browse"
          file={curr.file}
          dragging={curr.dragging}
          onFile={(f) => setCurr((s) => ({ ...s, file: f }))}
          onDragOver={(e) => { e.preventDefault(); setCurr((s) => ({ ...s, dragging: true })); }}
          onDragLeave={() => setCurr((s) => ({ ...s, dragging: false }))}
          onDrop={makeDropHandler(setCurr)}
          inputRef={currInputRef}
        />
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={!ready}
          className={`px-8 py-3 rounded-lg font-semibold text-sm transition-colors
            ${ready
              ? "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
        >
          {disabled ? "Analyzing…" : "Analyze Differences"}
        </button>
      </div>
    </div>
  );
}
