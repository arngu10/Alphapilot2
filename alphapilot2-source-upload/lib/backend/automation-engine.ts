import { validateDrivePlan } from "./drive-validation";
import { submitExecutionOrderFromPlan } from "./execution-engine";
import { canExecuteLiveOrders, getRiskChecks } from "./risk-engine";
import { runScanner } from "./scanner-engine";
import { scannerHardRules } from "./scanner-policy";
import { executionState, riskSettings } from "./seed";
import { persistDecisionJournalEntry } from "./supabase";
import type { AutomationCycle, AutomationDecision, DrivePlan, RiskCheck } from "./types";

const runtimeAutomationCycles: AutomationCycle[] = [];

function buildSimulationPlan(
  market: Awaited<ReturnType<typeof runScanner>>["analysis"]["markets"][number],
  generatedAt: string
): DrivePlan {
  const side = market.bias === "short" ? "short" : "long";
  const atr = market.structure.atr14 ?? Math.max(market.spread * 10, market.mid * 0.002);
  const entry = {
    min: Number((market.mid - atr * 0.12).toFixed(market.symbol.includes("XAU") ? 2 : 5)),
    max: Number((market.mid + atr * 0.12).toFixed(market.symbol.includes("XAU") ? 2 : 5))
  };
  const riskDistance = Math.max(atr * 1.5, market.spread * 8);
  const rewardDistance = riskDistance * 2;
  const precision = market.symbol.includes("XAU") || market.symbol.includes("BTC") ? 2 : 5;
  const stopLoss =
    side === "long"
      ? Number((entry.min - riskDistance).toFixed(precision))
      : Number((entry.max + riskDistance).toFixed(precision));
  const target =
    side === "long"
      ? Number((entry.max + rewardDistance).toFixed(precision))
      : Number((entry.min - rewardDistance).toFixed(precision));

  return {
    id: `simulation_${market.symbol}_${Date.now()}`,
    symbol: market.symbol,
    side,
    status: "review_ready",
    score: market.score,
    confidence: market.score >= 8 ? "high" : market.score >= 7 ? "medium" : "low",
    entry,
    stopLoss,
    targets: [target],
    riskPct: riskSettings.maxRiskPerTradePct,
    rewardRisk: 2,
    source: "mt5_live",
    rationale: [market.verdict],
    riskNotes: market.notes,
    createdAt: generatedAt
  };
}

function pushRuntimeAutomationCycle(cycle: AutomationCycle) {
  runtimeAutomationCycles.unshift(cycle);
  runtimeAutomationCycles.splice(25);
}

function summarizeAutomation(decisions: AutomationDecision[], globalBlockers: string[], liveEnabled: boolean) {
  const liveQueued = decisions.filter((decision) => decision.action === "queue_live_order");
  const eligible = decisions.filter((decision) => decision.action === "simulate_drive_plan");
  const blocked = decisions.filter((decision) => decision.action === "blocked").length;

  if (liveQueued.length > 0) {
    return {
      summary: `${liveQueued.length} live order(s) queued through governed automation; ${blocked} market(s) blocked.`,
      nextAction: `Monitor execution order status for ${liveQueued[0].symbol}.`
    };
  }

  if (globalBlockers.length > 0) {
    return {
      summary: `${eligible.length} simulated candidates, ${blocked} blocked. Global gate is stopping live automation.`,
      nextAction: "Review global blockers before treating any simulation as actionable."
    };
  }

  if (eligible.length > 0) {
    return {
      summary: liveEnabled
        ? `${eligible.length} market(s) qualify for execution review, but were not queued by final governance.`
        : `${eligible.length} market(s) qualify for simulated Drive review. Live execution remains disabled.`,
      nextAction: liveEnabled
        ? `Review governance checks for ${eligible[0].symbol}.`
        : `Review ${eligible[0].symbol} first because it has the strongest automation candidate.`
    };
  }

  return {
    summary: `No markets qualify for automation simulation. ${blocked} market(s) are blocked by score, session, news, or bias.`,
    nextAction: "Stay in Copilot/Drive and wait for a cleaner scanner cycle."
  };
}

function buildGlobalGates(riskChecks: RiskCheck[], globalBlockers: string[], liveEnabled: boolean) {
  const uniqueBlockers = Array.from(new Set(globalBlockers));
  return [
    ...riskChecks,
    {
      code: "execution_mode",
      label: "Execution mode",
      status: liveEnabled ? "pass" : "warn",
      detail: liveEnabled
        ? "Live execution is enabled by server governance and can queue MT5 orders."
        : "Automation can plan and audit decisions, but cannot execute live orders until explicitly enabled."
    } satisfies RiskCheck,
    {
      code: "global_blockers",
      label: "Global blockers",
      status: uniqueBlockers.length > 0 ? "warn" : "pass",
      detail: uniqueBlockers.length > 0 ? uniqueBlockers.join("; ") : "No global scanner blockers are active."
    } satisfies RiskCheck
  ];
}

export async function runAutomationCycle() {
  const { analysis, failedSources } = await runScanner("automation");
  const riskChecks = getRiskChecks();
  const liveExecutionAllowed = canExecuteLiveOrders();
  const globalBlockers = [
    ...(executionState.automationLocked ? executionState.lockReasons : []),
    ...(executionState.killSwitchActive ? ["Kill switch is active."] : []),
    ...(analysis.online ? [] : ["MT5 telemetry is offline."]),
    ...(analysis.session.canGenerateSetup ? [] : ["Outside active session window."]),
    ...(failedSources.length > scannerHardRules.maxFailedSources ? ["Insufficient data. Retry in 5 minutes."] : [])
  ];

  const decisions: AutomationDecision[] = await Promise.all(analysis.markets.map(async (market) => {
    const proposedPlan = market.bias === "neutral" ? null : buildSimulationPlan(market, analysis.generatedAt);
    const reviewGate = proposedPlan ? validateDrivePlan(proposedPlan) : null;
    const reviewBlockers =
      reviewGate?.checks
        .filter((check) => check.status === "fail")
        .map((check) => `${check.label}: ${check.detail}`) ?? [];
    const blockers = [
      ...globalBlockers,
      ...(market.riskClearance.status === "news_blackout" ? ["News blackout is active."] : []),
      ...(market.score < scannerHardRules.minimumScore ? [`Score below ${scannerHardRules.minimumScore}/10 threshold.`] : []),
      ...(market.bias === "neutral" ? ["Market bias is neutral."] : []),
      ...reviewBlockers
    ];
    const canSimulate = blockers.length === 0;
    const canQueueLiveOrder = canSimulate && Boolean(reviewGate?.canAutomate) && liveExecutionAllowed && proposedPlan;
    let executionOrderId: string | undefined;
    const queueBlockers: string[] = [];

    if (canQueueLiveOrder && proposedPlan) {
      try {
        const order = await submitExecutionOrderFromPlan({
          plan: proposedPlan,
          dryRun: false,
          source: "automation"
        });
        executionOrderId = order.id;
      } catch (error) {
        queueBlockers.push(error instanceof Error ? error.message : "Live order queueing failed.");
      }
    }

    return {
      symbol: market.symbol,
      action: executionOrderId ? "queue_live_order" : canSimulate ? "simulate_drive_plan" : "blocked",
      bias: market.bias,
      score: market.score,
      reason: executionOrderId
        ? `${market.symbol} passed governance and queued a live MT5 order.`
        : canSimulate
        ? `${market.symbol} would qualify for a simulated Drive plan. Live execution remains locked.`
        : `${market.symbol} is blocked from automation simulation.`,
      blockers: [...blockers, ...queueBlockers],
      proposedPlan: canSimulate && proposedPlan ? proposedPlan : undefined,
      executionOrderId,
      reviewGate: reviewGate
        ? {
            verdict: reviewGate.verdict,
            canReview: reviewGate.canReview,
            checks: reviewGate.checks
          }
        : undefined,
      generatedAt: analysis.generatedAt
    };
  }));

  const proposedActions = decisions
    .filter((decision) => (decision.action === "simulate_drive_plan" || decision.action === "queue_live_order") && decision.proposedPlan)
    .map((decision) => {
      const action = {
        symbol: decision.symbol,
        action: decision.action === "queue_live_order" ? ("queued_live_order" as const) : ("review_drive_plan" as const),
        planId: decision.proposedPlan!.id,
        side: decision.proposedPlan!.side,
        score: decision.score
      };
      return decision.executionOrderId ? { ...action, executionOrderId: decision.executionOrderId } : action;
    });
  const narrative = summarizeAutomation(decisions, globalBlockers, liveExecutionAllowed);
  const cycle = {
    id: `automation_cycle_${Date.now()}`,
    mode: "automation",
    status: executionState.automationLocked ? "locked" : liveExecutionAllowed ? "live_execution" : "simulation_only",
    executionEnabled: liveExecutionAllowed,
    dryRun: !liveExecutionAllowed,
    message: liveExecutionAllowed
      ? "Automation uses the live scanner and can queue governed MT5 orders."
      : "Automation uses the live scanner but cannot place trades until live execution is explicitly enabled.",
    generatedAt: analysis.generatedAt,
    session: {
      name: analysis.session.name,
      bias: analysis.session.bias,
      canGenerateSetup: analysis.session.canGenerateSetup
    },
    globalGates: buildGlobalGates(riskChecks, globalBlockers, liveExecutionAllowed),
    globalBlockers: Array.from(new Set(globalBlockers)),
    providerHealth: {
      failedCount: failedSources.length,
      failedSources: failedSources.map((source) => source.label)
    },
    decisions,
    proposedActions,
    summary: narrative.summary,
    nextAction: narrative.nextAction
  } satisfies AutomationCycle;

  void persistDecisionJournalEntry({
    kind: "automation",
    symbol: analysis.priority?.symbol ?? null,
    status: decisions.some((decision) => decision.action === "simulate_drive_plan") ? "info" : "blocked",
    summary: cycle.summary,
    payload: {
      cycleId: cycle.id,
      status: cycle.status,
      executionEnabled: cycle.executionEnabled,
      dryRun: cycle.dryRun,
      session: cycle.session,
      providerHealth: cycle.providerHealth,
      proposedActions: cycle.proposedActions,
      decisions: cycle.decisions.map((decision) => ({
        symbol: decision.symbol,
        action: decision.action,
        bias: decision.bias,
        score: decision.score,
        blockers: decision.blockers,
        reviewVerdict: decision.reviewGate?.verdict ?? null
      }))
    }
  });

  pushRuntimeAutomationCycle(cycle);
  return cycle;
}

export async function getAutomationSimulation() {
  return runAutomationCycle();
}

export function getLatestAutomationCycle() {
  return runtimeAutomationCycles[0] ?? null;
}

export function listAutomationCycles(limit = 10) {
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  return runtimeAutomationCycles.slice(0, safeLimit);
}
