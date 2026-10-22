import type { AuthorizationRecord, Evidence } from "./evidence";

export type LeakRequest = {
  evidence: Evidence;
  operational_context: string[];
};

export type LeakResult = {
  leaks: Array<{
    title: string;
    category: "labor" | "ingredients" | "delivery" | "waste" | "operations" | "pricing" | "other";
    evidence: string[];
    evidence_refs: string[];
    intervention_ref?: AuthorizationRecord["intervention"] | null;
    interpretation: string;
    confidence: "low" | "medium" | "high";
  }>;
  insufficient_evidence: Array<{ topic: string; reason: string }>;
};

export type LeakResponse = { leaks: LeakResult };

// Provider findings carry semantic evidence only. Trusted bindings are server-owned.
export type ModelLeakResult = Omit<LeakResult, "leaks"> & {
  leaks: Array<Omit<LeakResult["leaks"][number], "intervention_ref">>;
};
