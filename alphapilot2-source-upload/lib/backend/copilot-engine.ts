import { createMarketAnalysis } from "./analysis-engine";
import { getBlockingFailedSources, summarizeProviderHealth } from "./provider-health";
import { runScanner } from "./scanner-engine";
import { getLatestScannerSnapshot, listPersistedDrivePlans, persistDecisionJournalEntry } from "./supabase";
import type { DrivePlan } from "./types";

type AnalysisPayload = ReturnType<typeof createMarketAnalysis>;

function isAnalysisPayload(value: unknown): value is AnalysisPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnalysisPayload>;
  return Array.isArray(candidate.markets) && Boolean(candidate.session) && Array.isArray(candidate.sourceAudit);
}

function cleanPrompt(prompt: string | null | undefined) {
  return (prompt ?? "").trim().slice(0, 500);
}

function selectSymbol(prompt: string, explicitSymbol: string | null | undefined, analysis: AnalysisPayload) {
  const allowed = analysis.markets.map((market) => market.symbol);
  const requested = explicitSymbol?.toUpperCase();
  if (requested && allowed.includes(requested)) return requested;

  const upperPrompt = prompt.toUpperCase();
  return allowed.find((symbol) => upperPrompt.includes(symbol)) ?? analysis.priority?.symbol ?? allowed[0] ?? "XAUUSD";
}

async function getFreshAnalysis() {
  const { analysis } = await runScanner("copilot");
  return analysis;
}

async function getAnalysis() {
  const snapshot = await getLatestScannerSnapshot();
  if (snapshot && isAnalysisPayload(snapshot.analysis)) {
    const ageMs = Date.now() - new Date(snapshot.generatedAt).getTime();
    if (ageMs < 90_000) {
      return {
        analysis: snapshot.analysis,
        source: "scanner_snapshot" as const,
        snapshotAgeSeconds: Math.max(0, Math.round(ageMs / 1000))
      };
    }

    void runScanner("copilot").catch((error) => {
      console.warn("Background copilot scanner refresh failed", error);
    });

    return {
      analysis: snapshot.analysis,
      source: "stale_scanner_snapshot" as const,
      snapshotAgeSeconds: Math.max(0, Math.round(ageMs / 1000))
    };
  }

  return {
    analysis: await getFreshAnalysis(),
    source: "fresh_scan" as const,
    snapshotAgeSeconds: 0
  };
}

function planForSymbol(plans: DrivePlan[], symbol: string) {
  return plans.find((plan) => plan.symbol === symbol && plan.status !== "rejected") ?? null;
}

function getModeReadiness(analysis: AnalysisPayload, selectedMarket: AnalysisPayload["markets"][number] | undefined) {
  const blockers: string[] = [];
  const failedSources = getBlockingFailedSources(analysis.sourceAudit);

  if (!analysis.online) blockers.push("MT5 telemetry is offline.");
  if (analysis.session.canGenerateSetup === false) blockers.push("Outside active session window.");
  if (failedSources.length > analysis.hardRules.maxFailedSources) blockers.push("Insufficient data. Retry in 5 minutes.");
  if (selectedMarket?.riskClearance.status === "news_blackout") blockers.push("News blackout is active.");
  if (selectedMarket && selectedMarket.score < analysis.hardRules.minimumScore) {
    blockers.push(`${selectedMarket.symbol} is below the ${analysis.hardRules.minimumScore}/10 scanner threshold.`);
  }

  return {
    copilot: analysis.online ? "ready" : "limited",
    drive: blockers.length === 0 && selectedMarket?.bias !== "neutral" ? "ready" : "blocked",
    automation: "locked",
    blockers
  };
}

export async function createCopilotBrief(input: { prompt?: string | null; symbol?: string | null } = {}) {
  const prompt = cleanPrompt(input.prompt);
  const { analysis, source, snapshotAgeSeconds } = await getAnalysis();
  const symbol = selectSymbol(prompt, input.symbol, analysis);
  const selectedMarket = analysis.markets.find((market) => market.symbol === symbol) ?? analysis.priority ?? undefined;
  const plans = (await listPersistedDrivePlans()) ?? [];
  const matchingPlan = selectedMarket ? planForSymbol(plans, selectedMarket.symbol) : null;
  const readiness = getModeReadiness(analysis, selectedMarket);
  const providerHealth = summarizeProviderHealth(analysis.sourceAudit);

  const headline = selectedMarket
    ? `${selectedMarket.symbol} is ${selectedMarket.bias.toUpperCase()} with a ${selectedMarket.score.toFixed(1)}/10 scanner score.`
    : "Scanner is online but no market is selected yet.";

  const summary = selectedMarket
    ? [
        headline,
        `Session is ${analysis.session.name}, with ${analysis.session.bias} conditions.`,
        selectedMarket.verdict
      ].join(" ")
    : analysis.summary;

  const brief = {
    mode: "copilot",
    source,
    snapshotAgeSeconds,
    prompt: prompt || null,
    headline,
    summary,
    selectedSymbol: selectedMarket?.symbol ?? symbol,
    session: analysis.session,
    readiness,
    market: selectedMarket
      ? {
          symbol: selectedMarket.symbol,
          bid: selectedMarket.bid,
          ask: selectedMarket.ask,
          bias: selectedMarket.bias,
          score: selectedMarket.score,
          verdict: selectedMarket.verdict,
          support: selectedMarket.structure.support,
          resistance: selectedMarket.structure.resistance,
          atr14: selectedMarket.structure.atr14,
          riskClearance: selectedMarket.riskClearance,
          notes: selectedMarket.notes.slice(0, 6)
        }
      : null,
    drivePlan: matchingPlan
      ? {
          id: matchingPlan.id,
          status: matchingPlan.status,
          side: matchingPlan.side,
          entry: matchingPlan.entry,
          stopLoss: matchingPlan.stopLoss,
          targets: matchingPlan.targets,
          rewardRisk: matchingPlan.rewardRisk,
          createdAt: matchingPlan.createdAt
        }
      : null,
    nextActions: [
      readiness.drive === "ready" ? `Generate or review a Drive plan for ${selectedMarket?.symbol ?? symbol}.` : "Stay in Copilot mode until blockers clear.",
      matchingPlan ? `Review existing ${matchingPlan.symbol} Drive plan ${matchingPlan.id}.` : "No active Drive plan is attached to this brief.",
      "Automation remains locked and simulation-only."
    ],
    providerHealth,
    generatedAt: analysis.generatedAt
  };

  void persistDecisionJournalEntry({
    kind: "copilot",
    symbol: brief.selectedSymbol,
    status: readiness.drive === "ready" ? "info" : "blocked",
    summary: brief.summary,
    payload: {
      prompt: brief.prompt,
      readiness: brief.readiness,
      providerHealth: brief.providerHealth,
      drivePlanId: brief.drivePlan?.id ?? null,
      generatedAt: brief.generatedAt
    }
  });

  return brief;
}
