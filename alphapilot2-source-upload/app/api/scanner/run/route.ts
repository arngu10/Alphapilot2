import { ok, unauthorized } from "@/lib/backend/api-response";
import { isBridgeRequestAuthorized } from "@/lib/backend/auth";
import { runScanner } from "@/lib/backend/scanner-engine";

export async function GET(request: Request) {
  const cronTokenConfigured = Boolean(process.env.ALPHAPILOT_CRON_TOKEN);
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const cronAuthorized = cronTokenConfigured && bearerToken === process.env.ALPHAPILOT_CRON_TOKEN;

  if (cronTokenConfigured && !cronAuthorized && !isBridgeRequestAuthorized(request)) {
    return unauthorized("scanner run is not authorized");
  }

  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") === "cron" ? "cron" : "manual";
  const result = await runScanner(reason);

  return ok({
    status: result.decisionStatus,
    snapshotId: result.snapshot?.id ?? null,
    generatedAt: result.analysis.generatedAt,
    online: result.analysis.online,
    session: result.analysis.session,
    priority: result.analysis.priority
      ? {
          symbol: result.analysis.priority.symbol,
          bias: result.analysis.priority.bias,
          score: result.analysis.priority.score,
          verdict: result.analysis.priority.verdict
        }
      : null,
    eligibleMarkets: result.eligibleMarkets.map((market) => ({
      symbol: market.symbol,
      bias: market.bias,
      score: market.score
    })),
    failedSources: result.failedSources.map((source) => source.label)
  });
}
