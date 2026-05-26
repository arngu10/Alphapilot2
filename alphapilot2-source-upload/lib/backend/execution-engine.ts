import { validateDrivePlan } from "./drive-validation";
import { canExecuteLiveOrders, isLiveExecutionEnabled } from "./risk-engine";
import { addExecutionOrder, executionOrders, nowIso, updateExecutionOrder } from "./seed";
import { persistDecisionJournalEntry } from "./supabase";
import type { DrivePlan, ExecutionOrderRequest, ExecutionOrderStatus, RiskCheck } from "./types";

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundLots(value: number) {
  return Number(Math.max(value, 0.01).toFixed(2));
}

function executionCheck(code: string, label: string, status: RiskCheck["status"], detail: string): RiskCheck {
  return { code, label, status, detail };
}

function buildGovernance(plan: DrivePlan, dryRun: boolean) {
  const reviewGate = validateDrivePlan(plan);
  const checks = [...reviewGate.checks];
  const estimatedLots = plan.sizing?.estimatedLots ?? null;

  checks.push(
    executionCheck(
      "execution_mode",
      "Execution mode",
      dryRun ? "warn" : isLiveExecutionEnabled() ? "pass" : "fail",
      dryRun
        ? "Order will be queued as a dry run and will not reach the broker."
        : isLiveExecutionEnabled()
          ? "Server live execution flag is enabled."
          : "ALPHAPILOT_LIVE_EXECUTION_ENABLED must be true before live order queueing."
    )
  );

  checks.push(
    executionCheck(
      "lot_size",
      "Lot size",
      finitePositive(estimatedLots) ? "pass" : dryRun ? "warn" : "fail",
      finitePositive(estimatedLots)
        ? `Estimated size is ${estimatedLots} lots.`
        : "Plan does not include a positive estimated lot size from account telemetry."
    )
  );

  if (!dryRun) {
    checks.push(
      executionCheck(
        "live_execution_allowed",
        "Live execution allowed",
        canExecuteLiveOrders() ? "pass" : "fail",
        canExecuteLiveOrders()
          ? "Global live execution gates pass."
          : "Global live execution gates are blocked by kill switch, automation lock, connector, or risk state."
      )
    );
  }

  const blockers = checks.filter((check) => check.status === "fail").map((check) => `${check.label}: ${check.detail}`);
  const verdict = blockers.length ? "fail" : checks.some((check) => check.status === "warn") ? "warn" : "pass";

  return {
    verdict,
    checks,
    blockers
  } satisfies ExecutionOrderRequest["governance"];
}

export function listExecutionOrders(limit = 25, status?: ExecutionOrderStatus) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return executionOrders.filter((order) => (status ? order.status === status : true)).slice(0, safeLimit);
}

export async function submitExecutionOrderFromPlan(input: {
  plan: DrivePlan;
  dryRun?: boolean;
  source?: ExecutionOrderRequest["source"];
}) {
  const dryRun = input.dryRun ?? true;
  const governance = buildGovernance(input.plan, dryRun);

  if (!dryRun && governance.blockers.length > 0) {
    void persistDecisionJournalEntry({
      kind: "execution",
      symbol: input.plan.symbol,
      status: "blocked",
      summary: `${input.plan.symbol} live order blocked before queueing.`,
      payload: {
        planId: input.plan.id,
        blockers: governance.blockers,
        checks: governance.checks
      }
    });
    throw new Error(governance.blockers[0] ?? "Live execution is blocked by governance.");
  }

  const volumeLots = roundLots(input.plan.sizing?.estimatedLots ?? 0.01);
  const now = nowIso();
  const order = addExecutionOrder({
    id: `exec_${Date.now()}`,
    planId: input.plan.id,
    connectorId: "vantage-mt5",
    symbol: input.plan.symbol,
    side: input.plan.side,
    orderType: "market",
    volumeLots,
    entryReference: Number(((input.plan.entry.min + input.plan.entry.max) / 2).toFixed(input.plan.symbol.includes("XAU") ? 2 : 5)),
    stopLoss: input.plan.stopLoss,
    takeProfit: input.plan.targets[0],
    riskPct: input.plan.riskPct,
    dryRun,
    status: dryRun ? "dry_run" : "queued",
    source: input.source ?? "operator",
    requestedAt: now,
    updatedAt: now,
    governance
  });

  void persistDecisionJournalEntry({
    kind: "execution",
    symbol: order.symbol,
    status: dryRun ? "info" : "accepted",
    summary: dryRun
      ? `${order.symbol} execution dry run recorded.`
      : `${order.symbol} live order queued for MT5 bridge execution.`,
    payload: order
  });

  return order;
}

export async function reportExecutionOrder(input: {
  id: string;
  status: ExecutionOrderStatus;
  ticket?: number | null;
  retcode?: number | null;
  comment?: string | null;
  raw?: unknown;
}) {
  const order = updateExecutionOrder(input.id, {
    status: input.status,
    mt5: {
      ticket: input.ticket ?? null,
      retcode: input.retcode ?? null,
      comment: input.comment ?? null,
      raw: input.raw
    }
  });

  if (!order) {
    throw new Error(`Execution order ${input.id} was not found`);
  }

  void persistDecisionJournalEntry({
    kind: "execution",
    symbol: order.symbol,
    status: input.status === "rejected" ? "blocked" : "info",
    summary: `${order.symbol} execution order ${input.status}.`,
    payload: order
  });

  return order;
}
