import { connectors, executionState, getLatestMt5Heartbeat, riskSettings, trades } from "./seed";
import type { Mt5Heartbeat, RiskCheck } from "./types";

export function isLiveExecutionEnabled() {
  return process.env.ALPHAPILOT_LIVE_EXECUTION_ENABLED === "true";
}

export function getRiskChecks(latestMt5Heartbeat: Mt5Heartbeat | null = getLatestMt5Heartbeat()): RiskCheck[] {
  const openTrades = trades.filter((trade) => trade.status === "open" || trade.status === "pending_approval");
  const mt5 = connectors.find((connector) => connector.id === "vantage-mt5");
  const mt5Healthy = Boolean(latestMt5Heartbeat?.ok || mt5?.status === "connected");

  return [
    {
      code: "stop_loss_required",
      label: "Stop loss required",
      status: riskSettings.stopLossRequired ? "pass" : "fail",
      detail: riskSettings.stopLossRequired
        ? "Every executable trade must include a stop loss."
        : "Automation cannot unlock without mandatory stop loss enforcement."
    },
    {
      code: "kill_switch_enabled",
      label: "Kill switch enabled",
      status: riskSettings.killSwitchEnabled ? "pass" : "fail",
      detail: riskSettings.killSwitchEnabled
        ? "Emergency stop controls are required before live execution."
        : "Kill switch must be enabled before Drive or Automation execution."
    },
    {
      code: "max_open_trades",
      label: "Max open trades",
      status: openTrades.length < riskSettings.maxOpenTrades ? "pass" : "fail",
      detail: `${openTrades.length} of ${riskSettings.maxOpenTrades} trade slots are currently in use.`
    },
    {
      code: "mt5_bridge",
      label: "Vantage MT5 bridge",
      status: mt5Healthy ? "pass" : "fail",
      detail: mt5Healthy
        ? "MT5 bridge is healthy for read-only market/account telemetry."
        : "MT5 bridge is not connected yet."
    },
    {
      code: "automation_lock",
      label: "Automation lock",
      status: executionState.automationLocked ? "warn" : "pass",
      detail: executionState.automationLocked
        ? executionState.lockReasons.join("; ")
        : "Automation mode is unlocked."
    },
    {
      code: "live_execution_flag",
      label: "Live execution flag",
      status: isLiveExecutionEnabled() ? "pass" : "warn",
      detail: isLiveExecutionEnabled()
        ? "ALPHAPILOT_LIVE_EXECUTION_ENABLED is enabled on the server."
        : "Live execution is disabled by server configuration."
    }
  ];
}

export function canExecuteLiveOrders() {
  const checks = getRiskChecks();
  return (
    isLiveExecutionEnabled() &&
    checks.every((check) => check.status !== "fail") &&
    !checks.some((check) => check.code === "automation_lock" && check.status !== "pass") &&
    !executionState.killSwitchActive
  );
}
