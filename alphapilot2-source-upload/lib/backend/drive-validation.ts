import { executionState, riskSettings, trades } from "./seed";
import { canExecuteLiveOrders, isLiveExecutionEnabled } from "./risk-engine";
import type { DrivePlan, RiskCheck } from "./types";

type ValidationVerdict = "pass" | "warn" | "fail";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addCheck(checks: RiskCheck[], check: RiskCheck) {
  checks.push(check);
}

function verdictFromChecks(checks: RiskCheck[]): ValidationVerdict {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

export function validateDrivePlan(plan: DrivePlan) {
  const checks: RiskCheck[] = [];
  const openTrades = trades.filter((trade) => trade.status === "open" || trade.status === "pending_approval");
  const hasStopLoss = finiteNumber(plan.stopLoss) && plan.stopLoss > 0;
  const hasEntry = finiteNumber(plan.entry?.min) && finiteNumber(plan.entry?.max) && plan.entry.min > 0 && plan.entry.max > 0;
  const hasTargets = Array.isArray(plan.targets) && plan.targets.some((target) => finiteNumber(target) && target > 0);

  addCheck(checks, {
    code: "entry_zone",
    label: "Entry zone",
    status: hasEntry ? "pass" : "fail",
    detail: hasEntry ? `${plan.entry.min} to ${plan.entry.max}` : "A Drive plan needs a valid entry zone."
  });

  addCheck(checks, {
    code: "stop_loss_required",
    label: "Stop loss required",
    status: hasStopLoss ? "pass" : "fail",
    detail: hasStopLoss ? `Stop loss is set at ${plan.stopLoss}.` : "No trade can progress without a stop loss."
  });

  addCheck(checks, {
    code: "take_profit_required",
    label: "Take profit required",
    status: hasTargets ? "pass" : "fail",
    detail: hasTargets ? `${plan.targets.length} target level(s) attached.` : "At least one take-profit target is required."
  });

  addCheck(checks, {
    code: "minimum_rr",
    label: "Minimum R:R",
    status: plan.rewardRisk >= 2 ? "pass" : plan.rewardRisk >= 1.5 ? "warn" : "fail",
    detail: `Plan R:R is ${plan.rewardRisk.toFixed(2)}. Drive quality target is 2.00 or better.`
  });

  addCheck(checks, {
    code: "scanner_score",
    label: "Scanner score",
    status: plan.score >= 7 ? "pass" : plan.score >= 6 ? "warn" : "fail",
    detail: `${plan.symbol} scanner score is ${plan.score.toFixed(1)}/10. Minimum setup threshold is 7.0.`
  });

  addCheck(checks, {
    code: "risk_per_trade",
    label: "Risk per trade",
    status: plan.riskPct <= riskSettings.maxRiskPerTradePct ? "pass" : "fail",
    detail: `Plan risk is ${plan.riskPct}% and the cap is ${riskSettings.maxRiskPerTradePct}%.`
  });

  addCheck(checks, {
    code: "allowed_symbol",
    label: "Allowed symbol",
    status: riskSettings.allowedSymbols.includes(plan.symbol) ? "pass" : "fail",
    detail: riskSettings.allowedSymbols.includes(plan.symbol)
      ? `${plan.symbol} is enabled.`
      : `${plan.symbol} is not enabled in risk settings.`
  });

  addCheck(checks, {
    code: "max_open_trades",
    label: "Max open trades",
    status: openTrades.length < riskSettings.maxOpenTrades ? "pass" : "fail",
    detail: `${openTrades.length} of ${riskSettings.maxOpenTrades} trade slots are currently in use.`
  });

  addCheck(checks, {
    code: "automation_lock",
    label: "Automation lock",
    status: executionState.automationLocked ? "warn" : "pass",
    detail: executionState.automationLocked
      ? "Automation remains locked; Drive can still prepare a manual review plan."
      : "Automation is unlocked."
  });

  addCheck(checks, {
    code: "kill_switch",
    label: "Kill switch",
    status: executionState.killSwitchActive ? "fail" : "pass",
    detail: executionState.killSwitchActive ? "Kill switch is active." : "Kill switch is clear."
  });

  const canAutomate = checks.every((check) => check.status !== "fail") && canExecuteLiveOrders();

  return {
    verdict: verdictFromChecks(checks),
    canReview: checks.every((check) => check.status !== "fail"),
    canAutomate,
    automationReason: canAutomate
      ? "Plan can be submitted to the execution queue."
      : isLiveExecutionEnabled()
        ? "Live execution is blocked by governance checks."
        : "Live execution is disabled by server configuration.",
    checks
  };
}
