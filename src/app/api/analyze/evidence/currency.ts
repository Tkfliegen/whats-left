const codes = new Set(["USD", "TWD", "AED", "EUR", "GBP"]);
const aliases: Record<string, string> = { "US$": "USD", "NT$": "TWD", "€": "EUR", "£": "GBP" };
type CurrencyNormalization = { ok: true; currency: string | null } | { ok: false };

// Only explicit source fields are context: never names, locations, amounts,
// language, extracted assumptions, or the browser's locale. Support the current
// text form (including its notes prefix) and JSON structured source fields.
function sourceCurrencies(source: string): string[] {
  // Match field headers separately so a second declaration after punctuation
  // is checked too, rather than hidden in the first field's trailing prose.
  const labels = /(?:^|[\r\n]|[.,;][ \t]+)[ \t]*(?:Business description \/ notes:[ \t]*)?(?:business currency|currency)[ \t]*:[ \t]*(?:\r?\n[ \t]*)?/gim;
  const explicit = [...source.matchAll(labels)].map(match => {
    const value = source.slice(match.index! + match[0].length).split(/[\r\n]/, 1)[0].trim();
    // Only terminate at a sentence boundary or another labeled field. Lists
    // such as USD / EUR or USD, EUR remain invalid rather than choosing one.
    const token = /^([A-Za-z]{3})(?=$|\.$|\.[ \t]+[A-Za-z][a-z]+(?:[ \t]|:)|,[ \t]+[A-Za-z][A-Za-z \t]*:)/.exec(value);
    return (token?.[1] ?? value).replace(/\.$/, "").toUpperCase();
  });
  const fields = /"(?:business_currency|currency)"\s*:\s*"([^"\r\n]*)"/gi;
  return [...explicit, ...[...source.matchAll(fields)].map(match => match[1].trim().replace(/\.$/, "").toUpperCase())];
}

export function normalizeEvidenceCurrency(extracted: string | null, source: string): CurrencyNormalization {
  const contexts = new Set(sourceCurrencies(source));
  // Unsupported source codes are not permission to substitute a known one.
  if (contexts.size > 1 || [...contexts].some(code => !codes.has(code))) return { ok: false };
  const context = [...contexts][0];
  const raw = extracted?.normalize("NFKC").trim().toUpperCase() ?? "";
  if (!raw) return { ok: true, currency: context ?? null };
  if (raw === "$") {
    if (context && context !== "USD") return { ok: false };
    return { ok: true, currency: context ?? null };
  }
  // Arabic dirham notation is accepted only with an explicit AED source field.
  if (raw === "د.إ") return context === "AED" ? { ok: true, currency: "AED" }
    : context ? { ok: false } : { ok: true, currency: null };
  const canonical = codes.has(raw) ? raw : aliases[raw];
  if (context && canonical !== context) return { ok: false };
  return { ok: true, currency: canonical ?? null };
}
