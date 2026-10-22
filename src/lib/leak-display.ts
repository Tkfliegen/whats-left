import type { LeakResult } from "@/types/leaks";

// Keep only the user's statements. In particular, do not split decimal amounts.
export function operationalContext(notes: string): string[] {
  return notes.split(/\r?\n/)
    .map(line => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ""))
    .flatMap(line => line.split(/(?<=[.!?])\s+(?=[A-Z])/u))
    .map(statement => statement.trim())
    .filter(Boolean);
}

export function leakSummary(result: LeakResult): string {
  const count = result.leaks.length;
  return count === 0 ? "No confirmed profit leaks" : `${count} profit ${count === 1 ? "leak" : "leaks"} found`;
}

// A conservative presentation guard, not a financial calculator. Reject newly
// introduced numbers instead of silently editing findings or inventing impacts.
export function usesReportedNumbers(result: LeakResult, suppliedInput: string): boolean {
  const numbers = (text: string) => text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)?.map(value => value.replace(/,/g, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")) ?? [];
  const supplied = new Set(numbers(suppliedInput));
  return numbers(JSON.stringify(result, (key, value) => key === "evidence_refs" ? undefined : value)).every(value => supplied.has(value));
}

export type LeakRejectionDiagnostic = {
  stage: "leaks";
  reason: "unreported_number";
  message: "Unreported numbers in leak response";
  violations: Array<{ field: string; numbers: string[] }>;
};

// Diagnostic only: never used to decide acceptance or rewrite a response.
// Retain field paths and offending normalized numbers, never provider prose,
// supplied business notes, full responses, headers, or credentials.
export function unreportedNumberDiagnostic(result: LeakResult, suppliedInput: string): LeakRejectionDiagnostic {
  // Keep tokenization identical to usesReportedNumbers; acceptance stays there.
  const numbers = (text: string) => text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)?.map(value => value.replace(/,/g, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")) ?? [];
  const supplied = new Set(numbers(suppliedInput));
  const violations: LeakRejectionDiagnostic["violations"] = [];
  const visit = (value: unknown, field: string) => {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${field}[${index}]`));
    else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (key !== "evidence_refs") visit(item, field ? `${field}.${key}` : key);
      }
    } else {
      const missing = [...new Set(numbers(JSON.stringify(value) ?? "").filter(number => !supplied.has(number)))];
      if (missing.length) violations.push({ field, numbers: missing });
    }
  };
  visit(result, "");
  return { stage: "leaks", reason: "unreported_number", message: "Unreported numbers in leak response", violations };
}
