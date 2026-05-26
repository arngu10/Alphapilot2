import { createMarketAnalysis } from "./analysis-engine";
import { getExternalMarketContext } from "./data-providers";
import { getBlockingFailedSources } from "./provider-health";
import { getLatestMt5Heartbeat } from "./seed";
import {
  getLatestPersistedMt5Heartbeat,
  listUpcomingEconomicEvents,
  persistDecisionJournalEntry,
  persistScannerSnapshot
} from "./supabase";

export type ScannerRunReason = "manual" | "analysis" | "copilot" | "drive" | "automation" | "cron";

export type ScannerRunResult = Awaited<ReturnType<typeof runScanner>>;

export async function runScanner(reason: ScannerRunReason = "manual") {
  const liveHeartbeat = getLatestMt5Heartbeat();
  const [persistedHeartbeat, economicEvents, externalContext] = await Promise.all([
    liveHeartbeat ? Promise.resolve(null) : getLatestPersistedMt5Heartbeat(),
    listUpcomingEconomicEvents(48),
    getExternalMarketContext()
  ]);
  const heartbeat = liveHeartbeat ?? persistedHeartbeat;
  const mergedEconomicEvents = [...(economicEvents ?? []), ...externalContext.economicEvents];
  const analysis = createMarketAnalysis(heartbeat, mergedEconomicEvents, externalContext);
  const failedSources = getBlockingFailedSources(analysis.sourceAudit);
  const eligibleMarkets = analysis.markets.filter(
    (market) =>
      analysis.session.canGenerateSetup &&
      market.riskClearance.status !== "news_blackout" &&
      market.score >= analysis.hardRules.minimumScore &&
      market.bias !== "neutral"
  );
  const decisionStatus = !analysis.online
    ? "blocked"
    : failedSources.length > analysis.hardRules.maxFailedSources
      ? "blocked"
      : eligibleMarkets.length > 0
        ? "accepted"
        : "info";

  const snapshot = await persistScannerSnapshot(analysis);
  await persistDecisionJournalEntry({
    kind: "scanner",
    symbol: analysis.priority?.symbol ?? null,
    status: decisionStatus,
    summary: `${reason} scanner run: ${analysis.summary}`,
    payload: {
      reason,
      generatedAt: analysis.generatedAt,
      snapshotId: snapshot?.id ?? null,
      session: analysis.session,
      priority: analysis.priority
        ? {
            symbol: analysis.priority.symbol,
            bias: analysis.priority.bias,
            score: analysis.priority.score,
            verdict: analysis.priority.verdict
          }
        : null,
      marketCount: analysis.markets.length,
      eligibleMarkets: eligibleMarkets.map((market) => ({
        symbol: market.symbol,
        bias: market.bias,
        score: market.score
      })),
      failedSources: failedSources.map((source) => source.label)
    }
  });

  return {
    analysis,
    snapshot,
    decisionStatus,
    eligibleMarkets,
    failedSources
  };
}
