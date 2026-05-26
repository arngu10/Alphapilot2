import type {
  DecisionJournalEntry,
  DecisionJournalKind,
  DrivePlan,
  EconomicEvent,
  Mt5Heartbeat,
  ProviderAuditItem,
  ScannerSnapshot
} from "./types";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runtimeEconomicEvents: EconomicEvent[] = [];
const runtimeScannerSnapshots: ScannerSnapshot[] = [];
const runtimeDecisionJournal: DecisionJournalEntry[] = [];

function isConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

type SupabaseTableStatus = "ready" | "missing" | "error" | "not_configured";

type SupabaseDiagnosticTable = {
  table: string;
  label: string;
  required: boolean;
  status: SupabaseTableStatus;
  detail: string;
};

const diagnosticTables = [
  {
    table: "mt5_heartbeats",
    label: "MT5 heartbeats",
    required: true
  },
  {
    table: "drive_plans",
    label: "Drive plans",
    required: true
  },
  {
    table: "economic_events",
    label: "Economic calendar events",
    required: true
  },
  {
    table: "scanner_snapshots",
    label: "Scanner snapshots",
    required: true
  },
  {
    table: "decision_journal",
    label: "Decision journal",
    required: true
  },
  {
    table: "journal_entries",
    label: "Legacy journal entries",
    required: false
  }
] as const;

function getMissingTableAction(table: string) {
  if (table === "scanner_snapshots" || table === "decision_journal") {
    return "Run the scanner persistence block in docs/supabase.sql, then trigger /api/scanner/run once.";
  }

  if (table === "mt5_heartbeats" || table === "drive_plans" || table === "economic_events") {
    return "Run the core persistence block in docs/supabase.sql.";
  }

  return "Optional legacy table is missing; no action needed unless older journal screens need it.";
}

async function checkSupabaseTable(table: (typeof diagnosticTables)[number]): Promise<SupabaseDiagnosticTable> {
  if (!isConfigured()) {
    return {
      table: table.table,
      label: table.label,
      required: table.required,
      status: "not_configured",
      detail: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table.table}?select=id&limit=1`, {
      headers: {
        apikey: serviceRoleKey as string,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      cache: "no-store"
    });

    if (response.ok) {
      return {
        table: table.table,
        label: table.label,
        required: table.required,
        status: "ready",
        detail: "Readable through Supabase REST."
      };
    }

    const body = await response.text().catch(() => "");
    const lowerBody = body.toLowerCase();
    const isMissing =
      response.status === 404 ||
      lowerBody.includes("could not find") ||
      lowerBody.includes("does not exist") ||
      lowerBody.includes("relation");

    return {
      table: table.table,
      label: table.label,
      required: table.required,
      status: isMissing ? "missing" : "error",
      detail: isMissing ? "Table is missing or not exposed through PostgREST." : `${response.status} ${body}`.slice(0, 240)
    };
  } catch (error) {
    return {
      table: table.table,
      label: table.label,
      required: table.required,
      status: "error",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getSupabaseDiagnostics() {
  const tables = await Promise.all(diagnosticTables.map(checkSupabaseTable));
  const requiredTables = tables.filter((table) => table.required);
  const missingRequired = requiredTables.filter((table) => table.status === "missing");
  const erroredRequired = requiredTables.filter((table) => table.status === "error");
  const readyRequired = requiredTables.filter((table) => table.status === "ready");
  const configured = isConfigured();

  const status =
    !configured || requiredTables.every((table) => table.status === "not_configured")
      ? "not_configured"
      : missingRequired.length === 0 && erroredRequired.length === 0
        ? "ready"
        : readyRequired.length > 0
          ? "partial"
          : "blocked";

  const nextActions = Array.from(
    new Set([
      ...(!configured ? ["Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."] : []),
      ...tables.filter((table) => table.status === "missing").map((table) => getMissingTableAction(table.table)),
      ...(erroredRequired.length > 0 ? ["Check Supabase service role permissions and project health."] : [])
    ])
  );

  return {
    configured,
    status,
    readyRequired: readyRequired.length,
    requiredTables: requiredTables.length,
    tables,
    nextActions
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!isConfigured()) return null;

  const method = init.method?.toUpperCase() ?? "GET";
  const attempts = method === "GET" ? 3 : 1;
  const timeoutMs = method === "GET" ? 5000 : 7000;
  let lastMessage = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          apikey: serviceRoleKey as string,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...init.headers
        },
        cache: "no-store"
      });

      if (response.ok) {
        if (response.status === 204) return null;
        return (await response.json()) as T;
      }

      const message = await response.text().catch(() => response.statusText);
      lastMessage = `${response.status} ${message}`;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }

  console.warn(`Supabase request failed: ${lastMessage}`);
  return null;
}

export async function persistMt5Heartbeat(heartbeat: Mt5Heartbeat) {
  await supabaseRequest("mt5_heartbeats", {
    method: "POST",
    body: JSON.stringify({
      connector_id: "vantage-mt5",
      ok: heartbeat.ok,
      reported_at: heartbeat.timestamp,
      account: heartbeat.account,
      symbols: heartbeat.symbols,
      candles: heartbeat.candles ?? [],
      positions: heartbeat.positions,
      last_error: heartbeat.last_error
    })
  });
}

export async function getLatestPersistedMt5Heartbeat(): Promise<Mt5Heartbeat | null> {
  const rows = await supabaseRequest<
    Array<{
      ok: boolean;
      reported_at: string;
      account: Mt5Heartbeat["account"];
      symbols: Mt5Heartbeat["symbols"];
      candles?: Mt5Heartbeat["candles"];
      positions: Mt5Heartbeat["positions"];
      last_error: Mt5Heartbeat["last_error"];
    }>
  >("mt5_heartbeats?select=ok,reported_at,account,symbols,candles,positions,last_error&order=reported_at.desc&limit=1");

  const row = rows?.[0];
  if (!row) return null;

  return {
    ok: row.ok,
    timestamp: row.reported_at,
    account: row.account,
    symbols: row.symbols,
    candles: row.candles ?? [],
    positions: row.positions,
    last_error: row.last_error
  };
}

export async function persistDrivePlan(plan: DrivePlan) {
  await supabaseRequest("drive_plans", {
    method: "POST",
    body: JSON.stringify({
      id: plan.id,
      symbol: plan.symbol,
      side: plan.side,
      status: plan.status,
      score: plan.score,
      confidence: plan.confidence,
      entry: plan.entry,
      stop_loss: plan.stopLoss,
      targets: plan.targets,
      risk_pct: plan.riskPct,
      reward_risk: plan.rewardRisk,
      source: plan.source,
      rationale: plan.rationale,
      risk_notes: plan.riskNotes,
      created_at: plan.createdAt
    })
  });
}

export async function updatePersistedDrivePlanStatus(id: string, status: DrivePlan["status"]) {
  const rows = await supabaseRequest<
    Array<{
      id: string;
      symbol: string;
      side: DrivePlan["side"];
      status: DrivePlan["status"];
      score: number;
      confidence: DrivePlan["confidence"];
      entry: DrivePlan["entry"];
      stop_loss: number;
      targets: number[];
      risk_pct: number;
      reward_risk: number;
      source: DrivePlan["source"];
      rationale: string[];
      risk_notes: string[];
      created_at: string;
    }>
  >(`drive_plans?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

  const row = rows?.[0];
  if (!row) return null;

  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    status: row.status,
    score: Number(row.score),
    confidence: row.confidence,
    entry: row.entry,
    stopLoss: Number(row.stop_loss),
    targets: row.targets.map(Number),
    riskPct: Number(row.risk_pct),
    rewardRisk: Number(row.reward_risk),
    source: row.source,
    rationale: row.rationale,
    riskNotes: row.risk_notes,
    createdAt: row.created_at
  } satisfies DrivePlan;
}

export async function listPersistedDrivePlans(): Promise<DrivePlan[] | null> {
  const rows = await supabaseRequest<
    Array<{
      id: string;
      symbol: string;
      side: DrivePlan["side"];
      status: DrivePlan["status"];
      score: number;
      confidence: DrivePlan["confidence"];
      entry: DrivePlan["entry"];
      stop_loss: number;
      targets: number[];
      risk_pct: number;
      reward_risk: number;
      source: DrivePlan["source"];
      rationale: string[];
      risk_notes: string[];
      created_at: string;
    }>
  >(
    "drive_plans?select=id,symbol,side,status,score,confidence,entry,stop_loss,targets,risk_pct,reward_risk,source,rationale,risk_notes,created_at&order=created_at.desc&limit=25"
  );

  if (!rows) return null;

  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    status: row.status,
    score: Number(row.score),
    confidence: row.confidence,
    entry: row.entry,
    stopLoss: Number(row.stop_loss),
    targets: row.targets.map(Number),
    riskPct: Number(row.risk_pct),
    rewardRisk: Number(row.reward_risk),
    source: row.source,
    rationale: row.rationale,
    riskNotes: row.risk_notes,
    createdAt: row.created_at
  }));
}

function mapEconomicEvent(row: {
  id: string;
  title: string;
  currency: string;
  impact: EconomicEvent["impact"];
  starts_at: string;
  source: EconomicEvent["source"];
  notes: string | null;
}) {
  return {
    id: row.id,
    title: row.title,
    currency: row.currency,
    impact: row.impact,
    startsAt: row.starts_at,
    source: row.source,
    notes: row.notes
  } satisfies EconomicEvent;
}

export async function listUpcomingEconomicEvents(hours = 48): Promise<EconomicEvent[] | null> {
  const now = new Date();
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const rows = await supabaseRequest<
    Array<{
      id: string;
      title: string;
      currency: string;
      impact: EconomicEvent["impact"];
      starts_at: string;
      source: EconomicEvent["source"];
      notes: string | null;
    }>
  >(
    `economic_events?select=id,title,currency,impact,starts_at,source,notes&starts_at=gte.${encodeURIComponent(
      now.toISOString()
    )}&starts_at=lte.${encodeURIComponent(end.toISOString())}&order=starts_at.asc`
  );

  if (rows) return rows.map(mapEconomicEvent);

  return runtimeEconomicEvents.filter((event) => {
    const eventTime = new Date(event.startsAt).getTime();
    return eventTime >= now.getTime() && eventTime <= end.getTime();
  });
}

export async function persistEconomicEvent(event: Omit<EconomicEvent, "id"> & { id?: string }) {
  const rows = await supabaseRequest<
    Array<{
      id: string;
      title: string;
      currency: string;
      impact: EconomicEvent["impact"];
      starts_at: string;
      source: EconomicEvent["source"];
      notes: string | null;
    }>
  >("economic_events", {
    method: "POST",
    body: JSON.stringify({
      id: event.id,
      title: event.title,
      currency: event.currency.toUpperCase(),
      impact: event.impact,
      starts_at: event.startsAt,
      source: event.source,
      notes: event.notes ?? null
    })
  });

  const row = rows?.[0];
  if (row) return mapEconomicEvent(row);

  const fallback = {
    id: event.id ?? `runtime_event_${Date.now()}`,
    title: event.title,
    currency: event.currency.toUpperCase(),
    impact: event.impact,
    startsAt: event.startsAt,
    source: event.source,
    notes: event.notes ?? null
  } satisfies EconomicEvent;
  pushRuntimeEconomicEvent(fallback);
  return fallback;
}

function mapScannerSnapshot(row: {
  id: string;
  generated_at: string;
  online: boolean;
  session_name: string;
  priority_symbol: string | null;
  priority_score: number | null;
  providers: ProviderAuditItem[];
  analysis: unknown;
}) {
  return {
    id: row.id,
    generatedAt: row.generated_at,
    online: row.online,
    sessionName: row.session_name,
    prioritySymbol: row.priority_symbol,
    priorityScore: row.priority_score === null ? null : Number(row.priority_score),
    providers: row.providers,
    analysis: row.analysis
  } satisfies ScannerSnapshot;
}

function pushRuntimeScannerSnapshot(snapshot: ScannerSnapshot) {
  runtimeScannerSnapshots.unshift(snapshot);
  runtimeScannerSnapshots.splice(50);
}

function pushRuntimeEconomicEvent(event: EconomicEvent) {
  const existingIndex = runtimeEconomicEvents.findIndex((runtimeEvent) => runtimeEvent.id === event.id);
  if (existingIndex >= 0) {
    runtimeEconomicEvents.splice(existingIndex, 1, event);
  } else {
    runtimeEconomicEvents.push(event);
  }
  runtimeEconomicEvents.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  runtimeEconomicEvents.splice(100);
}

function pushRuntimeDecisionJournal(entry: DecisionJournalEntry) {
  runtimeDecisionJournal.unshift(entry);
  runtimeDecisionJournal.splice(100);
}

export async function persistScannerSnapshot(analysis: {
  generatedAt: string;
  online: boolean;
  session: { name: string };
  priority: { symbol: string; score: number } | null;
  sourceAudit: ProviderAuditItem[];
}) {
  const rows = await supabaseRequest<
    Array<{
      id: string;
      generated_at: string;
      online: boolean;
      session_name: string;
      priority_symbol: string | null;
      priority_score: number | null;
      providers: ProviderAuditItem[];
      analysis: unknown;
    }>
  >("scanner_snapshots", {
    method: "POST",
    body: JSON.stringify({
      generated_at: analysis.generatedAt,
      online: analysis.online,
      session_name: analysis.session.name,
      priority_symbol: analysis.priority?.symbol ?? null,
      priority_score: analysis.priority?.score ?? null,
      providers: analysis.sourceAudit,
      analysis
    })
  });

  const row = rows?.[0];
  if (row) return mapScannerSnapshot(row);

  const fallback = {
    id: `runtime_snapshot_${Date.now()}`,
    generatedAt: analysis.generatedAt,
    online: analysis.online,
    sessionName: analysis.session.name,
    prioritySymbol: analysis.priority?.symbol ?? null,
    priorityScore: analysis.priority?.score ?? null,
    providers: analysis.sourceAudit,
    analysis
  } satisfies ScannerSnapshot;
  pushRuntimeScannerSnapshot(fallback);
  return fallback;
}

export async function getLatestScannerSnapshot(): Promise<ScannerSnapshot | null> {
  const rows = await supabaseRequest<
    Array<{
      id: string;
      generated_at: string;
      online: boolean;
      session_name: string;
      priority_symbol: string | null;
      priority_score: number | null;
      providers: ProviderAuditItem[];
      analysis: unknown;
    }>
  >(
    "scanner_snapshots?select=id,generated_at,online,session_name,priority_symbol,priority_score,providers,analysis&order=generated_at.desc&limit=1"
  );

  const row = rows?.[0];
  return row ? mapScannerSnapshot(row) : runtimeScannerSnapshots[0] ?? null;
}

export async function listScannerSnapshots(limit = 20): Promise<ScannerSnapshot[] | null> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await supabaseRequest<
    Array<{
      id: string;
      generated_at: string;
      online: boolean;
      session_name: string;
      priority_symbol: string | null;
      priority_score: number | null;
      providers: ProviderAuditItem[];
      analysis: unknown;
    }>
  >(
    `scanner_snapshots?select=id,generated_at,online,session_name,priority_symbol,priority_score,providers,analysis&order=generated_at.desc&limit=${safeLimit}`
  );

  return rows?.map(mapScannerSnapshot) ?? runtimeScannerSnapshots.slice(0, safeLimit);
}

function mapDecisionJournalEntry(row: {
  id: string;
  kind: DecisionJournalKind;
  symbol: string | null;
  status: DecisionJournalEntry["status"];
  summary: string;
  payload: unknown;
  created_at: string;
}) {
  return {
    id: row.id,
    kind: row.kind,
    symbol: row.symbol,
    status: row.status,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.created_at
  } satisfies DecisionJournalEntry;
}

export async function persistDecisionJournalEntry(entry: {
  kind: DecisionJournalKind;
  symbol?: string | null;
  status: DecisionJournalEntry["status"];
  summary: string;
  payload?: unknown;
}) {
  const rows = await supabaseRequest<
    Array<{
      id: string;
      kind: DecisionJournalKind;
      symbol: string | null;
      status: DecisionJournalEntry["status"];
      summary: string;
      payload: unknown;
      created_at: string;
    }>
  >("decision_journal", {
    method: "POST",
    body: JSON.stringify({
      kind: entry.kind,
      symbol: entry.symbol ?? null,
      status: entry.status,
      summary: entry.summary,
      payload: entry.payload ?? {}
    })
  });

  const row = rows?.[0];
  if (row) return mapDecisionJournalEntry(row);

  const fallback = {
    id: `runtime_decision_${Date.now()}`,
    kind: entry.kind,
    symbol: entry.symbol ?? null,
    status: entry.status,
    summary: entry.summary,
    payload: entry.payload ?? {},
    createdAt: new Date().toISOString()
  } satisfies DecisionJournalEntry;
  pushRuntimeDecisionJournal(fallback);
  return fallback;
}

export async function listDecisionJournalEntries(limit = 50): Promise<DecisionJournalEntry[] | null> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await supabaseRequest<
    Array<{
      id: string;
      kind: DecisionJournalKind;
      symbol: string | null;
      status: DecisionJournalEntry["status"];
      summary: string;
      payload: unknown;
      created_at: string;
    }>
  >(
    `decision_journal?select=id,kind,symbol,status,summary,payload,created_at&order=created_at.desc&limit=${safeLimit}`
  );

  return rows?.map(mapDecisionJournalEntry) ?? runtimeDecisionJournal.slice(0, safeLimit);
}
