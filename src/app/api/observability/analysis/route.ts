import { completeTrace, TRACE_HEADER } from "../../../../lib/observability/langsmith";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body && Object.keys(body).length === 1 && ["complete", "failed", "cancelled"].includes(body.status)) {
      await completeTrace(request.headers.get(TRACE_HEADER), body.status);
    }
  } catch { /* Telemetry must never become a user-facing analysis error. */ }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
