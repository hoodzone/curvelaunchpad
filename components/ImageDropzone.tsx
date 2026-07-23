"use client";

import { useRef, useState } from "react";
import { fileToLogoDataUri } from "@/lib/image";
import { isImageUrl } from "@/lib/metadata";

/**
 * Drag-and-drop (or click / paste-URL) logo picker. Dropped files are resized
 * and compressed in the browser to a small data URI stored on-chain.
 */
export function ImageDropzone({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeKb, setSizeKb] = useState<number | null>(null);
  const [urlMode, setUrlMode] = useState(false);

  async function handleFile(file?: File | null) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { dataUri, bytes } = await fileToLogoDataUri(file, { maxDim: 128, maxBytes: 10000 });
      onChange(dataUri);
      setSizeKb(Math.round((bytes / 1024) * 10) / 10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that image.");
    } finally {
      setBusy(false);
    }
  }

  const hasImg = isImageUrl(value);

  if (urlMode) {
    return (
      <div>
        <label className="label">Image URL</label>
        <input
          className="input"
          placeholder="https://…/logo.png"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="mt-1 text-xs text-brand-400 hover:underline"
          onClick={() => setUrlMode(false)}
        >
          ← Upload a file instead
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="label">Logo</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer items-center gap-4 rounded-xl border border-dashed p-4 outline-none transition ${
          dragging
            ? "border-brand-500 bg-brand-500/10"
            : "border-white/15 bg-ink-850 hover:border-white/30 focus:border-brand-500/60"
        }`}
      >
        {hasImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="logo preview"
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/5 text-2xl">
            🖼️
          </div>
        )}
        <div className="min-w-0 text-sm">
          <div className="font-medium text-slate-200">
            {busy
              ? "Processing…"
              : hasImg
                ? "Logo ready — click to replace"
                : "Drag & drop an image, or click to browse"}
          </div>
          <div className="text-xs text-slate-500">
            {hasImg && sizeKb != null
              ? `Stored on-chain · ${sizeKb} KB`
              : "PNG, JPG, WebP or GIF — auto-resized to a compact logo"}
          </div>
        </div>
        {hasImg && (
          <button
            type="button"
            className="ml-auto rounded-lg px-2 py-1 text-xs text-rose-300 hover:bg-white/5"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setSizeKb(null);
              setError(null);
            }}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // allow re-selecting the same file
          handleFile(f);
        }}
      />
      {error && <p className="mt-1 text-xs text-rose-300">{error}</p>}
      <button
        type="button"
        className="mt-1 text-xs text-slate-400 hover:text-brand-400"
        onClick={() => setUrlMode(true)}
      >
        or paste an image URL
      </button>
    </div>
  );
}
