import { areAppWritesProtected, getBridgeToken } from "./auth";
import { getRiskChecks } from "./risk-engine";
import { connectors, executionState } from "./seed";
import { getLatestPersistedMt5Heartbeat, getLatestScannerSnapshot, getSupabaseDiagnostics, listDecisionJournalEntries } from "./supabase";

type ReadinessStatus = "ready" | "partial" | "blocked";

function statusFromBooleans(required: boolean[], optional: boolean[] = []): ReadinessStatus {
  if (required.every(Boolean) && optional.every(Boolean)) return "ready";
  if (required.every(Boolean)) return "partial";
  return "blocked";
}

function isConfigured(key: string) {
  return Boolean(process.env[key]?.trim());
}

function redactReason(ok: boolean, readyText: string, blockedText: string) {
  return ok ? readyText : blockedText;
}

export async function getReadiness() {
  const [latestHeartbeat, latestSnapshot, recentJournal, supabaseDiagnostics] = await Promise.all([
    getLatestPersistedMt5Heartbeat(),
    getLatestScannerSnapshot(),
    listDecisionJournalEntries(5),
    getSupabaseDiagnostics()
  ]);
  const riskChecks = getRiskChecks(latestHeartbeat);
  const mt5Connector = connectors.find((connector) => connector.id === "vantage-mt5");
  const providerKeys = {
    alphaVantage: isConfigured("ALPHA_VANTAGE_API_KEY"),
    finnhub: isConfigured("FINNHUB_API_KEY"),
    fred: isConfigured("FRED_API_KEY"),
    myfxbook: isConfigured("MYFXBOOK_EMAIL") && isConfigured("MYFXBOOK_PASSWORD")
  };
  const persistence = {
    supabaseConfigured: isConfigured("SUPABASE_URL") && isConfigured("SUPABASE_SERVICE_ROLE_KEY"),
    heartbeatSeen: Boolean(latestHeartbeat?.ok),
    scannerSnapshotSeen: Boolean(latestSnapshot),
    decisionJournalSeen: Boolean(recentJournal?.length),
    tablesReady: supabaseDiagnostics.status === "ready",
    missingTables: supabaseDiagnostics.tables.filter((table) => table.required && table.status === "missing").map((table) => table.table)
  };
  const riskReady = riskChecks.every((check) => check.status !== "fail");
  const mt5Ready = Boolean(latestHeartbeat?.ok || mt5Connector?.status === "connected");
  const providerReady = providerKeys.alphaVantage && providerKeys.finnhub && providerKeys.fred;

  const sections = [
    {
      id: "copilot",
      label: "Copilot",
      status: statusFromBooleans([mt5Ready], [providerReady]),
      summary: mt5Ready
        ? "Copilot can produce live briefs from MT5 telemetry and available provider context."
        : "Copilot needs MT5 telemetry before live briefs are trustworthy.",
      checks: [
        { label: "MT5 telemetry", ok: mt5Ready },
        { label: "Core provider keys", ok: providerReady },
        { label: "Decision journal", ok: persistence.decisionJournalSeen }
      ]
    },
    {
      id: "drive",
      label: "Drive",
      status: statusFromBooleans([mt5Ready, riskReady], [providerReady]),
      summary: riskReady
        ? "Drive can generate manual-review plans when session and scanner rules allow."
        : "Drive needs risk failures cleared before review plans should progress.",
      checks: [
        { label: "MT5 telemetry", ok: mt5Ready },
        { label: "Risk checks", ok: riskReady },
        { label: "Core provider keys", ok: providerReady }
      ]
    },
    {
      id: "automation",
      label: "Automation",
      status: executionState.automationLocked ? "blocked" : statusFromBooleans([mt5Ready, riskReady]),
      summary: executionState.automationLocked
        ? "Automation is intentionally locked and simulation-only."
        : "Automation lock is off, but execution should still require final governance review.",
      checks: [
        { label: "Automation unlocked", ok: !executionState.automationLocked },
        { label: "Kill switch clear", ok: !executionState.killSwitchActive },
        { label: "Risk checks", ok: riskReady }
      ]
    },
    {
      id: "data",
      label: "Data providers",
      status: statusFromBooleans([providerReady], [providerKeys.myfxbook]),
      summary: providerReady
        ? "Core free market-data providers are configured."
        : "Core provider keys are missing or incomplete.",
      checks: [
        { label: "Alpha Vantage", ok: providerKeys.alphaVantage },
        { label: "Finnhub", ok: providerKeys.finnhub },
        { label: "FRED", ok: providerKeys.fred },
        { label: "Myfxbook", ok: providerKeys.myfxbook }
      ]
    },
    {
      id: "persistence",
      label: "Persistence",
      status: statusFromBooleans([persistence.supabaseConfigured], [
        persistence.tablesReady,
        persistence.heartbeatSeen,
        persistence.scannerSnapshotSeen,
        persistence.decisionJournalSeen
      ]),
      summary: persistence.tablesReady
        ? "Supabase tables are installed and readable; live rows now confirm history depth."
        : persistence.supabaseConfigured
          ? "Supabase is configured; runtime fallback keeps scanner/calendar/journal moving until the remaining SQL is installed."
        : "Supabase is needed for persistent history and public product workflows.",
      checks: [
        { label: "Supabase env", ok: persistence.supabaseConfigured },
        { label: "Required tables", ok: persistence.tablesReady },
        { label: "MT5 heartbeat row", ok: persistence.heartbeatSeen },
        { label: "Scanner snapshot row", ok: persistence.scannerSnapshotSeen },
        { label: "Decision journal row", ok: persistence.decisionJournalSeen }
      ],
      details: {
        missingTables: persistence.missingTables
      }
    },
    {
      id: "launch",
      label: "Public launch",
      status: statusFromBooleans([areAppWritesProtected(), Boolean(getBridgeToken()), persistence.tablesReady], [
        providerReady,
        riskReady
      ]),
      summary: areAppWritesProtected()
        ? "Write protection is enabled for public-read/private-command operation."
        : "Add ALPHAPILOT_APP_TOKEN before treating the app as public.",
      checks: [
        { label: "App write token", ok: areAppWritesProtected() },
        { label: "Bridge token", ok: Boolean(getBridgeToken()) },
        { label: "Supabase tables", ok: persistence.tablesReady },
        { label: "Risk checks", ok: riskReady }
      ]
    }
  ];

  const readyCount = sections.filter((section) => section.status === "ready").length;
  const blockedCount = sections.filter((section) => section.status === "blocked").length;

  return {
    generatedAt: new Date().toISOString(),
    overall: blockedCount > 0 ? "partial" : readyCount === sections.length ? "ready" : "partial",
    summary: `${readyCount}/${sections.length} sections fully ready; ${blockedCount} blocked.`,
    sections,
    nextActions: [
      redactReason(areAppWritesProtected(), "App write token is configured.", "Add ALPHAPILOT_APP_TOKEN before public launch."),
      redactReason(
        persistence.tablesReady && persistence.scannerSnapshotSeen && persistence.decisionJournalSeen,
        "Supabase persistence has live scanner/journal rows.",
        supabaseDiagnostics.nextActions[0] ?? "Run the remaining Supabase SQL and trigger a scanner run to populate snapshots/journal."
      ),
      redactReason(
        executionState.automationLocked,
        "Keep Automation locked while Drive/Copilot are hardened.",
        "Re-lock Automation until governance and audit controls are complete."
      )
    ]
  };
}
