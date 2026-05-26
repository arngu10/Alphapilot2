import { runScanner } from "./scanner-engine";
import { executionState } from "./seed";
import { getBlockingFailedSources, summarizeProviderHealth } from "./provider-health";
import { sanitizeAnalysis, sanitizeDrivePlans, sanitizeScannerSnapshot } from "./sanitize";
import { getLatestScannerSnapshot, listPersistedDrivePlans } from "./supabase";
import { createMarketAnalysis } from "./analysis-engine";

type AnalysisPayload = ReturnType<typeof createMarketAnalysis>;

function isAnalysisPayload(value: unknown): value is AnalysisPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnalysisPayload>;
  return Array.isArray(candidate.markets) && Boolean(candidate.session) && Array.isArray(candidate.sourceAudit);
}

export async function getLatestIntelligence() {
  const latestSnapshot = await getLatestScannerSnapshot();
  const snapshotAgeMs = latestSnapshot ? Date.now() - new Date(latestSnapshot.generatedAt).getTime() : Number.POSITIVE_INFINITY;
  const shouldRefresh = !latestSnapshot || snapshotAgeMs > 90_000 || !isAnalysisPayload(latestSnapshot.analysis);
  const scannerRun = shouldRefresh ? await runScanner("manual") : null;
  const analysis = scannerRun?.analysis ?? (latestSnapshot?.analysis as AnalysisPayload);
  const plans = (await listPersistedDrivePlans()) ?? [];
  const failedSources = getBlockingFailedSources(analysis.sourceAudit);
  const providerHealth = summarizeProviderHealth(analysis.sourceAudit);
  const eligibleMarkets = analysis.markets.filter(
    (market) =>
      analysis.session.canGenerateSetup &&
      market.riskClearance.status !== "news_blackout" &&
      market.score >= analysis.hardRules.minimumScore &&
      market.bias !== "neutral"
  );

  return {
    generatedAt: analysis.generatedAt,
    source: scannerRun ? "fresh_scan" : "scanner_snapshot",
    snapshotAgeSeconds: scannerRun ? 0 : Math.max(0, Math.round(snapshotAgeMs / 1000)),
    scanner: sanitizeAnalysis(analysis),
    latestSnapshot: sanitizeScannerSnapshot(scannerRun?.snapshot ?? latestSnapshot),
    modes: {
      current: executionState.mode,
      copilot: analysis.online ? "ready" : "limited",
      drive: eligibleMarkets.length > 0 && failedSources.length <= analysis.hardRules.maxFailedSources ? "ready" : "blocked",
      automation: executionState.automationLocked ? "locked" : "simulation_only"
    },
    priority: analysis.priority
      ? {
          symbol: analysis.priority.symbol,
          bias: analysis.priority.bias,
          score: analysis.priority.score,
          verdict: analysis.priority.verdict
        }
      : null,
    eligibleMarkets: eligibleMarkets.map((market) => ({
      symbol: market.symbol,
      bias: market.bias,
      score: market.score,
      bid: market.bid,
      ask: market.ask
    })),
    blockers: [
      ...(analysis.online ? [] : ["MT5 telemetry is offline."]),
      ...(analysis.session.canGenerateSetup ? [] : ["Outside active session window."]),
      ...(failedSources.length > analysis.hardRules.maxFailedSources ? ["Insufficient data. Retry in 5 minutes."] : []),
      ...executionState.lockReasons.map((reason) => `Automation: ${reason}`)
    ],
    providerHealth,
    latestDrivePlans: sanitizeDrivePlans(plans.slice(0, 5)).map((plan) => ({
      id: plan.id,
      symbol: plan.symbol,
      side: plan.side,
      status: plan.status,
      score: plan.score,
      confidence: plan.confidence,
      rewardRisk: plan.rewardRisk,
      createdAt: plan.createdAt
    }))
  };
}
