export type AnalysisDraft = { businessName: string; businessType: string; notes: string; files: readonly File[] };
export function snapshotSource(draft: AnalysisDraft) {
  return Object.freeze({ ...draft, files: Object.freeze([...draft.files]),
    input: [`Business name: ${draft.businessName}`, `Selected business type: ${draft.businessType}`, `Business description / notes: ${draft.notes}`].join("\n") });
}
export type AnalysisSource = ReturnType<typeof snapshotSource>;
export function sourceSummary(source: AnalysisSource) {
  const note = source.notes.trim() ? "Note" : "Business details";
  if (!source.files.length) return note;
  const files = source.files.length === 1 ? source.files[0].name : `${source.files.length} files`;
  return `${source.notes.trim() ? `${note} + ` : ""}${files} (files selected locally; not analyzed)`;
}
