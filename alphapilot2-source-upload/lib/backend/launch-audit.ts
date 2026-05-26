import { areAppWritesProtected, getBridgeToken } from "./auth";
import { getBlockingFailedSources, summarizeProviderHealth } from "./provider-health";
import { getReadiness } from "./readiness-engine";
import { canExecuteLiveOrders, getRiskChecks, isLiveExecutionEnabled } from "./risk-engine";
import { connectors, executionState } from "./seed";
import { getSupabaseDiagnostics, listDecisionJournalEntries, listScannerSnapshots } from "./supabase";
import { getExternalMarketContext } from "./data-providers";

type LaunchGateStatus = "pass" | "warn" | "fail";

function envSet(key: string) {
  return Boolean(process.env[key]?.trim());
}

function gate(input: {
  id: string;
  label: string;
  status: LaunchGateStatus;
  detail: string;
  nextAction?: string;
}) {
  return input;
}

export async function getLaunchAudit() {
  const [readiness, persistence, providerContext, scannerHistory, decisionJournal] = await Promise.all([
    getReadiness(),
    getSupabaseDiagnostics(),
    getExternalMarketContext(),
    listScannerSnapshots(5),
    listDecisionJournalEntries(10)
  ]);
  const providerHealth = summarizeProviderHealth(providerContext.audit);
  const blockingProviderFailures = getBlockingFailedSources(providerContext.audit);
  const mt5Connector = connectors.find((connector) => connector.id === "vantage-mt5");
  const requiredTablesReady = persistence.status === "ready";
  const hasScannerRows = Boolean(scannerHistory?.length);
  const hasJournalRows = Boolean(decisionJournal?.length);
  const appWritesProtected = areAppWritesProtected();
  const bridgeTokenConfigured = Boolean(getBridgeToken());
  const cronTokenConfigured = envSet("ALPHAPILOT_CRON_TOKEN");
  const riskChecks = getRiskChecks();
  const riskFailures = riskChecks.filter((check) => check.status === "fail");

  const gates = [
    gate({
      id: "api_contract",
      label: "API contract",
      status: "pass",
      detail: "Core backend routes are present for dashboard, scanner, Copilot, Drive, Automation, readiness, provider health, and persistence."
    }),
    gate({
      id: "write_protection",
      label: "Write protection",
      status: appWritesProtected ? "pass" : "fail",
      detail: appWritesProtected
        ? "ALPHAPILOT_APP_TOKEN is configured, so write endpoints can require operator authorization."
        : "ALPHAPILOT_APP_TOKEN is missing; public deployments would allow unprotected write-style requests.",
      nextAction: appWritesProtected ? undefined : "Set ALPHAPILOT_APP_TOKEN before public launch."
    }),
    gate({
      id: "bridge_auth",
      label: "Bridge authentication",
      status: bridgeTokenConfigured ? "pass" : "fail",
      detail: bridgeTokenConfigured
        ? "Bridge token is available for signed MT5 heartbeat and calendar ingestion."
        : "Bridge token is missing.",
      nextAction: bridgeTokenConfigured ? undefined : "Set ALPHAPILOT_BRIDGE_TOKEN in production."
    }),
    gate({
      id: "scanner_cron",
      label: "Scanner cron protection",
      status: cronTokenConfigured ? "pass" : "warn",
      detail: cronTokenConfigured
        ? "ALPHAPILOT_CRON_TOKEN is configured for scheduled scanner calls."
        : "Cron token is not configured; scanner refresh remains on-demand or bridge-authorized.",
      nextAction: cronTokenConfigured ? undefined : "Set ALPHAPILOT_CRON_TOKEN when enabling scheduled scans."
    }),
    gate({
      id: "persistence",
      label: "Persistence",
      status: requiredTablesReady && hasScannerRows && hasJournalRows ? "pass" : requiredTablesReady ? "warn" : "fail",
      detail: requiredTablesReady
        ? `Required tables are readable. Scanner rows: ${scannerHistory?.length ?? 0}; decision journal rows: ${decisionJournal?.length ?? 0}.`
        : `Persistence is ${persistence.status}.`,
      nextAction:
        requiredTablesReady && hasScannerRows && hasJournalRows
          ? undefined
          : persistence.nextActions[0] ?? "Run Supabase SQL, then trigger a scanner run and one Copilot/Drive/Automation action."
    }),
    gate({
      id: "providers",
      label: "Market data providers",
      status: blockingProviderFailures.length === 0 ? "pass" : blockingProviderFailures.length <= 2 ? "warn" : "fail",
      detail: `${providerHealth.fetchedSources.length} fetched source(s), ${providerHealth.failedCount} blocking failure(s), ${providerHealth.substitutedSources.length} substituted source(s).`,
      nextAction: blockingProviderFailures.length ? "Review /api/providers/health and configure or replace failing core providers." : undefined
    }),
    gate({
      id: "risk",
      label: "Risk controls",
      status: riskFailures.length ? "fail" : "pass",
      detail: riskFailures.length
        ? `${riskFailures.length} risk control(s) are failing.`
        : "Risk controls are configured without hard failures.",
      nextAction: riskFailures.length ? riskFailures[0].detail : undefined
    }),
    gate({
      id: "automation_lock",
      label: "Automation control",
      status: executionState.automationLocked || canExecuteLiveOrders() ? "pass" : "fail",
      detail: executionState.automationLocked
        ? "Automation is locked and simulation-only."
        : canExecuteLiveOrders()
          ? "Automation is unlocked with live execution gates passing."
          : "Automation lock is off, but live execution governance is not passing.",
      nextAction:
        executionState.automationLocked || canExecuteLiveOrders()
          ? undefined
          : "Re-lock Automation or clear live execution blockers before running automation cycles."
    }),
    gate({
      id: "live_execution",
      label: "Live execution",
      status: canExecuteLiveOrders() ? "pass" : isLiveExecutionEnabled() ? "warn" : "fail",
      detail: isLiveExecutionEnabled()
        ? `Server live execution flag is enabled; current live order eligibility: ${canExecuteLiveOrders()}.`
        : "Server live execution flag is disabled.",
      nextAction: canExecuteLiveOrders()
        ? undefined
        : "Set ALPHAPILOT_LIVE_EXECUTION_ENABLED=true, clear risk blockers, unlock Automation, and enable ALPHAPILOT_BRIDGE_ENABLE_LIVE_ORDERS on the VPS only when ready."
    }),
    gate({
      id: "mt5_connector",
      label: "MT5 connector",
      status: mt5Connector?.status === "connected" ? "pass" : "warn",
      detail: mt5Connector
        ? `${mt5Connector.name} is ${mt5Connector.status}; execution enabled: ${mt5Connector.canExecute}.`
        : "Vantage MT5 connector record is missing.",
      nextAction: mt5Connector?.status === "connected" ? undefined : "Run the MT5 bridge on the VPS and confirm /api/mt5/heartbeat receives signed heartbeats."
    })
  ];

  const failures = gates.filter((item) => item.status === "fail");
  const warnings = gates.filter((item) => item.status === "warn");

  return {
    generatedAt: new Date().toISOString(),
    status: failures.length ? "blocked" : warnings.length ? "partial" : "ready",
    summary: `${gates.length - failures.length - warnings.length}/${gates.length} launch gates pass; ${failures.length} fail; ${warnings.length} warn.`,
    gates,
    readiness,
    nextActions: Array.from(
      new Set([
        ...failures.map((item) => item.nextAction).filter((item): item is string => Boolean(item)),
        ...warnings.map((item) => item.nextAction).filter((item): item is string => Boolean(item)),
        ...readiness.nextActions
      ])
    )
  };
}
