// Opaque, server-signed correlation only. No SDK, keys, business data or source
// notes enter this transport; disabled servers add no header and no extra call.
export function createAnalysisTrace() {
  let context: string | null = null;
  const headers = (): Record<string, string> => ({ "Content-Type": "application/json", ...(context ? { "x-whats-left-trace": context } : {}) });
  return {
    headers,
    observe(response: Response) {
      try {
        const value = response.headers.get("x-whats-left-trace");
        if (value && value.length <= 512 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) context = value;
      } catch { /* Correlation is optional and never changes the analysis error path. */ }
    },
    finish(status: "complete" | "failed" | "cancelled") {
      if (!context) return;
      try {
        void fetch("/api/observability/analysis", { method: "POST", headers: headers(),
          body: JSON.stringify({ status }), keepalive: true }).catch(() => { /* Best effort; no retry. */ });
      } catch { /* Observability never changes application results. */ }
    },
  };
}
