import type { DrivePlan, Mt5Heartbeat, ScannerSnapshot } from "./types";
import { createMarketAnalysis } from "./analysis-engine";

type AnalysisPayload = ReturnType<typeof createMarketAnalysis>;

function sanitizeDriveRiskNote(note: string) {
  if (note.toLowerCase().startsWith("approx risk amount")) {
    return "Approximate sizing is prepared, but account-specific risk amount is hidden from public responses.";
  }

  return note;
}

export function sanitizeMt5Heartbeat(heartbeat: Mt5Heartbeat | null) {
  if (!heartbeat) return null;

  return {
    ok: heartbeat.ok,
    timestamp: heartbeat.timestamp,
    account: heartbeat.account
      ? {
          connected: true,
          server: heartbeat.account.server,
          company: heartbeat.account.company,
          currency: heartbeat.account.currency,
          leverage: heartbeat.account.leverage
        }
      : null,
    symbolCount: heartbeat.symbols.filter(Boolean).length,
    symbols: heartbeat.symbols
      .filter(Boolean)
      .map((tick) => ({
        symbol: tick!.symbol,
        bid: tick!.bid,
        ask: tick!.ask,
        time: tick!.time
      })),
    candleSetCount: heartbeat.candles?.length ?? 0,
    positionsCount: heartbeat.positions.length,
    lastError: heartbeat.last_error
  };
}

export function sanitizeAnalysis(analysis: AnalysisPayload) {
  return {
    ...analysis,
    connector: {
      id: analysis.connector.id,
      status: analysis.connector.status,
      server: analysis.connector.server,
      company: analysis.connector.company,
      currency: analysis.connector.currency
    },
    account: analysis.account
      ? {
          connected: true,
          currency: analysis.connector.currency,
          leverage: analysis.account.leverage
        }
      : null
  };
}

export function sanitizeScannerSnapshot(snapshot: ScannerSnapshot | null) {
  if (!snapshot) return null;

  const analysis =
    snapshot.analysis &&
    typeof snapshot.analysis === "object" &&
    Array.isArray((snapshot.analysis as Partial<AnalysisPayload>).markets) &&
    (snapshot.analysis as Partial<AnalysisPayload>).connector
      ? sanitizeAnalysis(snapshot.analysis as AnalysisPayload)
      : snapshot.analysis;

  return {
    ...snapshot,
    analysis
  };
}

export function sanitizeDrivePlan(plan: DrivePlan) {
  return {
    ...plan,
    riskNotes: plan.riskNotes.map(sanitizeDriveRiskNote),
    sizing: plan.sizing
      ? {
          accountCurrency: plan.sizing.accountCurrency,
          stopDistance: plan.sizing.stopDistance,
          estimatedLots: plan.sizing.estimatedLots,
          model: plan.sizing.model,
          notes: plan.sizing.notes
        }
      : undefined
  };
}

export function sanitizeDrivePlans(plans: DrivePlan[]) {
  return plans.map((plan) => sanitizeDrivePlan(plan));
}
