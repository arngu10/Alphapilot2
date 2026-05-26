import { getDashboard } from "./dashboard-engine";
import { getExternalMarketContext } from "./data-providers";
import { summarizeProviderHealth } from "./provider-health";
import { getReadiness } from "./readiness-engine";
import { sanitizeScannerSnapshot } from "./sanitize";
import { getLatestScannerSnapshot, getSupabaseDiagnostics } from "./supabase";

export async function getOperatorStatus() {
  const [dashboard, readiness, persistence, latestSnapshot, providerContext] = await Promise.all([
    getDashboard(),
    getReadiness(),
    getSupabaseDiagnostics(),
    getLatestScannerSnapshot(),
    getExternalMarketContext()
  ]);
  const providerHealth = summarizeProviderHealth(providerContext.audit);
  const blockingIssues = [
    ...readiness.sections
      .filter((section) => section.status === "blocked")
      .map((section) => `${section.label}: ${section.summary}`),
    ...providerHealth.failedSources.map((source) => `Provider failed: ${source}`),
    ...persistence.tables
      .filter((table) => table.required && table.status !== "ready")
      .map((table) => `Persistence ${table.table}: ${table.status}`)
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: blockingIssues.length === 0 ? "ready" : readiness.overall,
    dashboard: {
      status: dashboard.status,
      priority: dashboard.priority,
      alerts: dashboard.alerts
    },
    readiness: {
      overall: readiness.overall,
      summary: readiness.summary,
      sections: readiness.sections,
      nextActions: readiness.nextActions
    },
    providerHealth: {
      failedCount: providerHealth.failedCount,
      failedSources: providerHealth.failedSources,
      fetchedSources: providerHealth.fetchedSources,
      substitutedSources: providerHealth.substitutedSources
    },
    persistence: {
      status: persistence.status,
      readyRequired: persistence.readyRequired,
      requiredTables: persistence.requiredTables,
      missingTables: persistence.tables
        .filter((table) => table.required && table.status === "missing")
        .map((table) => table.table),
      nextActions: persistence.nextActions
    },
    scanner: {
      latest: sanitizeScannerSnapshot(latestSnapshot)
    },
    blockingIssues: Array.from(new Set(blockingIssues))
  };
}
