import type { EvidenceSource } from "@/types/evidence";

// Validation only: compare literal numeric expressions from original statements.
// Never strip units to pool digits, normalize currencies, or calculate values.
const currency = "(?:USD|TWD|AED|EUR|GBP|US\\$|NT\\$|\\$|€|£|د\\.إ)";
const unit = "(?:percentage[ -]points?|percent(?:age)?(?:[ -]points?)?|staff members?|staff|workers?|persons?|people|employees?|hours?|minutes?|days?|weeks?|months?|years?|orders?|items?|units?|kg|kilograms?|grams?|litres?|liters?)";
const prefix = new RegExp(`(${currency}|room|version|ID)[ \\t]*$`, "i");
const suffix = new RegExp(`^[ \\t]*(%|${unit}|${currency})(?![\\p{L}\\p{N}_])`, "iu");
const perUnit = /^[ \t]+(?:per|each)[ \t]+(?:worker|person|staff member|order|hour|day|month|year)(?![\p{L}\p{N}_])/iu;
const numeric = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
const wordMoney = new RegExp(`${currency}[ \t]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|quarter|dozen)\\b`, "i");
const wordQuantity = new RegExp(`\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|quarter|dozen)\\s+(?:${unit}|percent|dollars?|euros?|pounds?)\\b`, "i");

function expressions(text: string): string[] | null {
  // Unimplemented numeric forms must not silently pass as non-numeric prose.
  if (/\d[ \t]*[+*/=<>^:\-][ \t]*[+-]?\d/.test(text)) return null;
  if (wordQuantity.test(text) || wordMoney.test(text) || /[\p{N}]/u.test(text.replace(/[0-9]/g, ""))) return null;
  const claims: string[] = [];
  for (const match of text.matchAll(/[+-]?(?:\d[\d,.]*|\.\d+)/g)) {
    let token = match[0];
    // A terminal sentence stop or list comma is punctuation, not a digit.
    if ((token.endsWith(".") && !token.endsWith(".."))
      || (token.endsWith(",") && !token.endsWith(",,"))) token = token.slice(0, -1);
    if (!numeric.test(token)) return null;
    let start = match.index!, end = start + token.length;
    const left = text.slice(0, start), right = text.slice(end);
    const before = prefix.exec(left), after = suffix.exec(right);
    if (before) start -= before[0].length;
    // Unknown currency codes/notations and abbreviated units fail closed.
    if (!before && /(?:\b[A-Z]{3}|[$€£¥₹])[ \t]*$/.test(left)) return null;
    if (after) end += after[0].length;
    if (before && after) return null;
    if (after?.[1] === "%" && /^[ \t]*(?:%|points?\b|percentage\b)/i.test(text.slice(end))) return null;
    const per = perUnit.exec(text.slice(end));
    if (per) end += per[0].length;
    const adjacentLeft = text[start - 1] ?? "", adjacentRight = text[end] ?? "";
    if (/[\p{L}\p{N}_%+\-.,/:*=<>^]/u.test(adjacentLeft)
      || /[\p{L}\p{N}_%+\-/:*=<>^]/u.test(adjacentRight)
      || (adjacentRight === "," && !/\s|^$/.test(text[end + 1] ?? ""))
      || (adjacentRight === "." && /[\d.]/.test(text[end + 1] ?? ""))) return null;
    // Do not accept an unrecognized trailing unit as a bare scalar claim.
    if (!after && !per && /^[ \t]+[\p{L}]/u.test(right)
      && !/^[ \t]+(?:for|from|toward|to|on|in|during|of|and|or|was|is|were|are|last|this|current|previous)\b/i.test(right)) return null;
    if (!after && !per && /^[ \t]+(?:[A-Z]{3}\b|dollars?\b|euros?\b|pounds?\b|percent\b|percentage\b|pp\b|bps\b|[kKmMbB]\b)/.test(right)) return null;
    claims.push(text.slice(start, end));
  }
  return claims;
}

export function filterMissingInformation(entries: string[], sources: EvidenceSource[]): string[] {
  const supported = new Set(sources.filter(source => /^source_input\[\d+\]$/.test(source.source))
    .flatMap(source => expressions(source.text) ?? []));
  return entries.filter(entry => {
    const claims = expressions(entry);
    return claims !== null && claims.every(claim => supported.has(claim));
  });
}
