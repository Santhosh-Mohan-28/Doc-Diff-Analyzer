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

function FileIcon({ uploaded = false }: { uploaded?: boolean }) {
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
        uploaded
          ? "bg-emerald-50 text-emerald-600"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {uploaded ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-7 w-7"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 12.5 9.5 17 19 7.5"
          />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="h-7 w-7"
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
            d="M8 12h7M8 15.5h4.5"
          />
        </svg>
      )}
    </div>
  );
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

    if (
      f &&
      (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
    ) {
      onFile(f);
    }
  }

  return (
    <div
      className={`
        group relative min-h-[270px] cursor-pointer overflow-hidden rounded-3xl
        border bg-white p-7 shadow-sm
        transition-all duration-300 ease-out
        ${
          dragging
            ? "scale-[1.01] border-indigo-400 bg-indigo-50/50 shadow-xl shadow-indigo-500/10"
            : file
              ? "border-emerald-200 shadow-emerald-500/5 hover:-translate-y-0.5 hover:shadow-lg"
              : "border-slate-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-900/5"
        }
      `}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label={`Upload ${label} PDF`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Decorative glow */}
      <div
        className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl transition-opacity duration-300 ${
          dragging
            ? "bg-indigo-300/40 opacity-100"
            : file
              ? "bg-emerald-200/30 opacity-100"
              : "bg-indigo-200/20 opacity-0 group-hover:opacity-100"
        }`}
      />

      <div className="relative flex h-full flex-col">
        {/* Label */}
        <div className="mb-7 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {file ? "Document selected" : "PDF document"}
            </p>
          </div>

          <div
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              file
                ? "bg-emerald-50 text-emerald-600"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {file ? "READY" : "STEP"}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <FileIcon uploaded={!!file} />

          {file ? (
            <div className="mt-5 w-full">
              <p
                className="mx-auto max-w-[260px] truncate text-sm font-semibold text-slate-800"
                title={file.name}
              >
                {file.name}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {(file.size / 1024).toFixed(0)} KB
              </p>

              <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-2.5 w-2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m5 10 3 3 7-7"
                    />
                  </svg>
                </span>
                Click to replace
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-800">
                {description}
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Drop your PDF here or browse files
              </p>

              <div className="mt-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-medium text-slate-400">
                PDF · MAX 20 MB
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentUploader({ onCompare, disabled }: Props) {
  const [prev, setPrev] = useState<SlotState>({
    file: null,
    dragging: false,
  });

  const [curr, setCurr] = useState<SlotState>({
    file: null,
    dragging: false,
  });

  const prevInputRef = useRef<HTMLInputElement>(null);
  const currInputRef = useRef<HTMLInputElement>(null);

  const makeDropHandler = useCallback(
    (setter: React.Dispatch<React.SetStateAction<SlotState>>) =>
      (e: React.DragEvent) => {
        e.preventDefault();

        setter((s) => ({
          ...s,
          dragging: false,
        }));

        const f = e.dataTransfer.files?.[0];

        if (
          f &&
          (f.type === "application/pdf" ||
            f.name.toLowerCase().endsWith(".pdf"))
        ) {
          setter((s) => ({
            ...s,
            file: f,
          }));
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
    <div className="space-y-7">
      {/* Upload area */}
      <div className="relative">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FileSlot
            label="Previous version"
            description="Upload the original document"
            file={prev.file}
            dragging={prev.dragging}
            onFile={(f) =>
              setPrev((s) => ({
                ...s,
                file: f,
              }))
            }
            onDragOver={(e) => {
              e.preventDefault();

              setPrev((s) => ({
                ...s,
                dragging: true,
              }));
            }}
            onDragLeave={() =>
              setPrev((s) => ({
                ...s,
                dragging: false,
              }))
            }
            onDrop={makeDropHandler(setPrev)}
            inputRef={prevInputRef}
          />

          <FileSlot
            label="Current version"
            description="Upload the updated document"
            file={curr.file}
            dragging={curr.dragging}
            onFile={(f) =>
              setCurr((s) => ({
                ...s,
                file: f,
              }))
            }
            onDragOver={(e) => {
              e.preventDefault();

              setCurr((s) => ({
                ...s,
                dragging: true,
              }));
            }}
            onDragLeave={() =>
              setCurr((s) => ({
                ...s,
                dragging: false,
              }))
            }
            onDrop={makeDropHandler(setCurr)}
            inputRef={currInputRef}
          />
        </div>

        {/* Connector */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-400 shadow-sm">
            VS
          </div>
        </div>
      </div>

      {/* Analyze action */}
      <div className="flex flex-col items-center">
        <button
          onClick={handleSubmit}
          disabled={!ready}
          className={`
            group relative flex min-w-[210px] items-center justify-center gap-2.5
            overflow-hidden rounded-2xl px-7 py-3.5
            text-sm font-semibold
            transition-all duration-200
            ${
              ready
                ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl active:translate-y-0"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }
          `}
        >
          {ready && (
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          )}

          <span className="relative">
            {disabled ? "Analyzing…" : "Analyze differences"}
          </span>

          {!disabled && (
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className={`relative h-4 w-4 transition-transform duration-200 ${
                ready ? "group-hover:translate-x-0.5" : ""
              }`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 10h11M11 5l5 5-5 5"
              />
            </svg>
          )}
        </button>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          {!prev.file && !curr.file
            ? "Add both document versions to begin"
            : !prev.file
              ? "Add the previous version to continue"
              : !curr.file
                ? "Add the current version to continue"
                : "Ready to analyze meaningful changes"}
        </p>
      </div>
    </div>
  );
}
