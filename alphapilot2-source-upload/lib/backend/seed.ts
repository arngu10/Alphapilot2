import type { ConnectorState, DrivePlan, ExecutionOrderRequest, ExecutionState, Mt5Heartbeat, RiskSettings, Trade } from "./types";

export const nowIso = () => new Date().toISOString();

interface BackendState {
  executionState: ExecutionState;
  riskSettings: RiskSettings;
  connectors: ConnectorState[];
  trades: Trade[];
  drivePlans: DrivePlan[];
  executionOrders: ExecutionOrderRequest[];
  latestMt5Heartbeat: Mt5Heartbeat | null;
}

const globalForState = globalThis as typeof globalThis & {
  __alphapilotBackendState?: BackendState;
};

const state =
  globalForState.__alphapilotBackendState ??
  (globalForState.__alphapilotBackendState = {
    executionState: {
      mode: "drive",
      killSwitchActive: false,
      automationLocked: true,
      lockReasons: [
        "Vantage MT5 bridge is not connected",
        "Live credential vault is not configured",
        "No production audit log sink configured"
      ]
    },
    riskSettings: {
      maxRiskPerTradePct: 0.5,
      maxDailyLossPct: 3,
      maxOpenTrades: 5,
      stopLossRequired: true,
      killSwitchEnabled: true,
      newsBlackoutEnabled: true,
      correlationAutoReduceEnabled: true,
      dailyLimitAutoPauseEnabled: true,
      drawdownPanicCloseEnabled: true,
      asiaSessionTradingEnabled: false,
      splitTakeProfitEnabled: true,
      dynamicStopTrailingEnabled: true,
      allowedSymbols: ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSDT"]
    },
    connectors: [
      {
        id: "vantage-mt5",
        kind: "mt5",
        name: "Vantage MT5",
        status: "pending",
        environment: "not_configured",
        latencyMs: null,
        lastHeartbeatAt: null,
        canExecute: false,
        notes: "First live connector. Waiting for Windows VPS and MT5 bridge."
      },
      {
        id: "binance",
        kind: "binance",
        name: "Binance",
        status: "locked",
        environment: "not_configured",
        latencyMs: null,
        lastHeartbeatAt: null,
        canExecute: false,
        notes: "Queued after MT5 bridge foundation is stable."
      },
      {
        id: "hyperliquid",
        kind: "hyperliquid",
        name: "Hyperliquid",
        status: "locked",
        environment: "not_configured",
        latencyMs: null,
        lastHeartbeatAt: null,
        canExecute: false,
        notes: "Planned wallet-signed perpetual connector."
      }
    ],
    trades: [
      {
        id: "trade_001",
        connectorId: "vantage-mt5",
        symbol: "XAUUSD",
        side: "long",
        size: "0.20 lot",
        status: "pending_approval",
        pnl: 0,
        openedAt: nowIso()
      },
      {
        id: "trade_002",
        connectorId: "vantage-mt5",
        symbol: "EURUSD",
        side: "short",
        size: "0.15 lot",
        status: "closed",
        pnl: 96,
        openedAt: "2026-05-09T09:14:00.000Z"
      }
    ],
    drivePlans: [],
    executionOrders: [],
    latestMt5Heartbeat: null
  });

export const executionState = state.executionState;
export const riskSettings = state.riskSettings;
export const connectors = state.connectors;
export const trades = state.trades;
export const drivePlans = state.drivePlans;
export const executionOrders = state.executionOrders;

export function getLatestMt5Heartbeat() {
  return state.latestMt5Heartbeat;
}

export function setLatestMt5Heartbeat(heartbeat: Mt5Heartbeat) {
  state.latestMt5Heartbeat = heartbeat;

  const mt5Connector = connectors.find((connector) => connector.id === "vantage-mt5");
  if (!mt5Connector) return;

  mt5Connector.lastHeartbeatAt = heartbeat.timestamp || nowIso();
  mt5Connector.status = heartbeat.ok ? "connected" : "offline";
  mt5Connector.environment = heartbeat.account ? "live" : "not_configured";
  mt5Connector.canExecute = heartbeat.ok && process.env.ALPHAPILOT_LIVE_EXECUTION_ENABLED === "true";
  mt5Connector.notes = heartbeat.ok
    ? mt5Connector.canExecute
      ? "MT5 bridge heartbeat received. Live execution is enabled by server configuration."
      : "MT5 bridge heartbeat received. Read-only health is online; live execution is disabled by server configuration."
    : "MT5 bridge heartbeat reported an unhealthy terminal.";

  executionState.lockReasons = executionState.lockReasons.filter(
    (reason) => reason !== "Vantage MT5 bridge is not connected"
  );

  if (!heartbeat.ok && !executionState.lockReasons.includes("Vantage MT5 bridge is not connected")) {
    executionState.lockReasons.unshift("Vantage MT5 bridge is not connected");
  }
}

export function addDrivePlan(plan: DrivePlan) {
  drivePlans.unshift(plan);
  return plan;
}

export function updateDrivePlanStatus(id: string, status: DrivePlan["status"]) {
  const plan = drivePlans.find((item) => item.id === id);
  if (!plan) return null;

  plan.status = status;
  return plan;
}

export function addExecutionOrder(order: ExecutionOrderRequest) {
  executionOrders.unshift(order);
  executionOrders.splice(100);
  return order;
}

export function updateExecutionOrder(id: string, patch: Partial<ExecutionOrderRequest>) {
  const order = executionOrders.find((item) => item.id === id);
  if (!order) return null;

  Object.assign(order, patch, {
    updatedAt: nowIso()
  });
  return order;
}
