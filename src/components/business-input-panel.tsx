"use client";

import { useRef, useState } from "react";
import { snapshotSource, sourceSummary, type AnalysisSource } from "@/lib/analysis-source";

type Props = {
  onAnalyze: (input: string, notes: string) => Promise<boolean | undefined>;
  onSource: (summary: string) => void;
  complete: boolean; isRunning: boolean; analysisError: string;
};
export function BusinessInputPanel({ onAnalyze, onSource, complete, isRunning, analysisError }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [activeSummary, setActiveSummary] = useState("");
  const failed = useRef<AnalysisSource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const disabled = pending || isRunning;
  function addFiles(selected: FileList | null) {
    if (!selected || locked.current || isRunning) return;
    const accepted = Array.from(selected).filter(file => /\.(csv|pdf|xlsx|png|jpe?g|webp|gif)$/i.test(file.name));
    setError(accepted.length !== selected.length ? "Please choose CSV, PDF, XLSX, or image files." : "");
    setFiles(current => [...current, ...accepted.filter(file => !current.some(item => item.name === file.name))]);
  }
  return <section className="panel p-6" aria-labelledby="input-title">
    <div className="mb-5 flex items-center justify-between gap-2"><h2 id="input-title" className="text-lg font-medium">Business Input</h2><span className="font-mono text-[9px] text-[var(--text-muted)]">01 / START HERE</span></div>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (disabled || locked.current) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      const source = analysisError && failed.current ? failed.current : snapshotSource({
        businessName: String(data.get("businessName") ?? ""), businessType: String(data.get("businessType") ?? ""),
        notes: String(data.get("notes") ?? ""), files,
      });
      setActiveSummary(sourceSummary(source));
      // Retry the exact failed snapshot, even if the editable draft changed.
      if (analysisError && failed.current) {
        (form.elements.namedItem("businessName") as HTMLInputElement).value = source.businessName;
        (form.elements.namedItem("businessType") as HTMLSelectElement).value = source.businessType;
        (form.elements.namedItem("notes") as HTMLTextAreaElement).value = source.notes;
        setFiles([...source.files]);
      }
      locked.current = true; setPending(true); setError(""); onSource(sourceSummary(source));
      let succeeded = false;
      try { succeeded = await onAnalyze(source.input, source.notes) === true; }
      finally {
        if (succeeded) {
          (form.elements.namedItem("notes") as HTMLTextAreaElement).value = "";
          if (fileInput.current) fileInput.current.value = "";
          setFiles([]); failed.current = null;
        } else { failed.current = source; }
        locked.current = false; setPending(false);
      }
    }}>
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1.25fr_1fr]"><label className="field-label">Business name<input name="businessName" required defaultValue="The Daily Grind" placeholder="Your business name" /></label><label className="field-label">Business type<select name="businessType" defaultValue="Café">{["Café", "Bakery", "Tea Shop", "Restaurant", "Other"].map(type => <option key={type}>{type}</option>)}</select></label></div>
        <label className="field-label">Notes <span className="text-[var(--text-muted)]">(optional)</span><textarea name="notes" rows={2} placeholder="Anything we should know? Quiet Tuesdays, rising supplier costs…" /></label>
        <label className="upload-zone" aria-disabled={disabled} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }}><span className="text-xl text-[var(--accent-primary)]" aria-hidden="true">↥</span><span className="text-xs text-[var(--text-secondary)]">Drop your business files here, or <span className="text-[var(--accent-primary)]">browse</span></span><span className="text-[10px] text-[var(--text-muted)]">CSV, PDF, XLSX, images · Local selection only · Not analyzed</span><input ref={fileInput} className="sr-only" aria-label="Choose business files" type="file" multiple accept=".csv,.pdf,.xlsx,.png,.jpg,.jpeg,.webp,.gif" onChange={event => addFiles(event.target.files)} /></label>
        <ul className="space-y-2" aria-label="Selected files">{files.map(file => <li key={file.name} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles(current => current.filter(item => item !== file)); if (fileInput.current) fileInput.current.value = ""; }} className="px-2 text-[var(--text-muted)]">×</button></li>)}</ul>
      </fieldset>
      {(error || analysisError) && <p role="alert" className="text-xs text-[var(--text-secondary)]">{analysisError || error}</p>}
      {analysisError && <p className="text-xs text-[var(--text-muted)]">Retry uses the retained inputs from the failed run.</p>}
      {disabled && activeSummary && <p role="status" className="text-xs text-[var(--text-secondary)]">Analyzing: {activeSummary}</p>}
      <button type="button" onClick={event => event.currentTarget.form?.requestSubmit()} disabled={disabled} aria-busy={disabled} className="flex w-full items-center justify-center gap-3 rounded-lg analyze-button px-4 py-3 text-sm font-semibold transition">{disabled ? "Analysis in progress…" : analysisError ? "Retry full analysis" : complete ? "Run Analysis Again" : "Analyze My Business"}<span aria-hidden="true">↗</span></button>
      <p className="text-center text-[10px] text-[var(--text-muted)]">AI analysis with deterministic validation and calculations · Files are not processed.</p>
    </form>
  </section>;
}
