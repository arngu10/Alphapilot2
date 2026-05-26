export type TradingMode = "copilot" | "drive" | "automation";

export type ConnectorKind = "mt5" | "binance" | "hyperliquid";

export type ConnectorStatus = "connected" | "pending" | "locked" | "offline";

export type TradeSide = "long" | "short";

export type TradeStatus = "open" | "closed" | "rejected" | "pending_approval";
export type ExecutionOrderStatus = "queued" | "sent" | "filled" | "rejected" | "cancelled" | "dry_run";

export type RiskCheckStatus = "pass" | "warn" | "fail";

export type DrivePlanStatus = "draft" | "review_ready" | "published" | "rejected";

export type EconomicEventImpact = "low" | "medium" | "high";

export interface ConnectorState {
  id: string;
  kind: ConnectorKind;
  name: string;
  status: ConnectorStatus;
  environment: "demo" | "live" | "not_configured";
  latencyMs: number | null;
  lastHeartbeatAt: string | null;
  canExecute: boolean;
  notes: string;
}

export interface RiskSettings {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenTrades: number;
  stopLossRequired: boolean;
  killSwitchEnabled: boolean;
  newsBlackoutEnabled: boolean;
  correlationAutoReduceEnabled: boolean;
  dailyLimitAutoPauseEnabled: boolean;
  drawdownPanicCloseEnabled: boolean;
  asiaSessionTradingEnabled: boolean;
  splitTakeProfitEnabled: boolean;
  dynamicStopTrailingEnabled: boolean;
  allowedSymbols: string[];
}

export interface Trade {
  id: string;
  connectorId: string;
  symbol: string;
  side: TradeSide;
  size: string;
  status: TradeStatus;
  pnl: number;
  openedAt: string;
}

export interface ExecutionState {
  mode: TradingMode;
  killSwitchActive: boolean;
  automationLocked: boolean;
  lockReasons: string[];
}

export interface ExecutionOrderRequest {
  id: string;
  planId: string | null;
  connectorId: "vantage-mt5";
  symbol: string;
  side: TradeSide;
  orderType: "market";
  volumeLots: number;
  entryReference: number;
  stopLoss: number;
  takeProfit: number;
  riskPct: number;
  dryRun: boolean;
  status: ExecutionOrderStatus;
  source: "drive" | "automation" | "operator";
  requestedAt: string;
  updatedAt: string;
  governance: {
    verdict: "pass" | "warn" | "fail";
    checks: RiskCheck[];
    blockers: string[];
  };
  mt5?: {
    ticket?: number | null;
    retcode?: number | null;
    comment?: string | null;
    raw?: unknown;
  };
}

export interface RiskCheck {
  code: string;
  label: string;
  status: RiskCheckStatus;
  detail: string;
}

export interface EconomicEvent {
  id: string;
  title: string;
  currency: string;
  impact: EconomicEventImpact;
  startsAt: string;
  source: "manual" | "fred" | "gdelt" | "provider";
  notes?: string | null;
}

export interface Mt5Tick {
  symbol: string;
  bid: number;
  ask: number;
  time: number;
}

export interface Mt5Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
}

export interface Mt5SymbolCandles {
  symbol: string;
  timeframes: Record<string, Mt5Candle[]>;
}

export interface Mt5AccountInfo {
  login: number;
  server: string;
  company: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  leverage: number;
  trade_mode: number;
}

export interface Mt5Position {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  profit: number;
}

export interface Mt5Heartbeat {
  ok: boolean;
  timestamp: string;
  account: Mt5AccountInfo | null;
  symbols: Array<Mt5Tick | null>;
  candles?: Mt5SymbolCandles[];
  positions: Mt5Position[];
  last_error: [number, string] | unknown;
}

export type ProviderStatus = "fetched" | "failed" | "not_configured" | "empty";

export interface ProviderAuditItem {
  id: string;
  label: string;
  status: ProviderStatus;
  fetchedAt: string | null;
  detail?: string;
  frontendVisible: false;
}

export interface SentimentReading {
  symbol: string;
  longPercentage: number | null;
  shortPercentage: number | null;
  longVolume: number | null;
  shortVolume: number | null;
  bias: "retail_long" | "retail_short" | "balanced" | "unknown";
  contrarianBias: "long" | "short" | "neutral";
}

export interface MacroReading {
  fedFundsRate: number | null;
  cpiLatest: number | null;
  tenYearYield: number | null;
  tenYearDirection: "rising" | "falling" | "flat" | "unknown";
  dxyPrice: number | null;
  dxyDirection: "rising" | "falling" | "flat" | "unknown";
  bias: "usd_bullish" | "usd_bearish" | "neutral";
}

export interface NewsReading {
  symbol: string;
  bullish: number;
  bearish: number;
  neutral: number;
  tone: "bullish" | "bearish" | "neutral" | "unknown";
  headlines: string[];
}

export interface CryptoDepthReading {
  symbol: string;
  provider: "binance" | "kraken" | "hyperliquid";
  price: number | null;
  priceChange24hPct: number | null;
  volume24h: number | null;
  fundingRate: number | null;
  openInterest: number | null;
  bias: "bullish" | "bearish" | "neutral" | "unknown";
}

export interface FearGreedReading {
  score: number | null;
  classification: string | null;
  direction: "improving" | "worsening" | "flat" | "unknown";
  riskMode: "risk_on" | "risk_off" | "neutral";
}

export interface PublicFlowReading {
  generatedAt: string;
  secInsider: {
    totalFilings: number | null;
    purchaseCount: number | null;
    saleCount: number | null;
    bias: "risk_on" | "risk_off" | "neutral" | "unknown";
  };
  federalSpending: {
    obligationTotal: number | null;
    transactionCount: number | null;
    bias: "liquidity_supportive" | "neutral" | "unknown";
  };
  treasuryFiscal: {
    publicDebt: number | null;
    publicDebtPrevious: number | null;
    direction: "rising" | "falling" | "flat" | "unknown";
    bias: "usd_pressure" | "neutral" | "unknown";
  };
  summary: string;
}

export interface ExternalMarketContext {
  generatedAt: string;
  audit: ProviderAuditItem[];
  economicEvents: EconomicEvent[];
  sentiment: SentimentReading[];
  macro: MacroReading | null;
  news: NewsReading[];
  cryptoDepth: CryptoDepthReading[];
  fearGreed: FearGreedReading | null;
  publicFlow: PublicFlowReading | null;
}

export interface DrivePlan {
  id: string;
  symbol: string;
  side: TradeSide;
  status: DrivePlanStatus;
  score: number;
  confidence: "low" | "medium" | "high";
  entry: {
    min: number;
    max: number;
  };
  stopLoss: number;
  targets: number[];
  riskPct: number;
  rewardRisk: number;
  source: "mt5_live" | "demo_snapshot";
  rationale: string[];
  riskNotes: string[];
  sizing?: {
    accountCurrency: string | null;
    accountEquity: number | null;
    riskAmount: number | null;
    stopDistance: number;
    estimatedLots: number | null;
    model: "approximate";
    notes: string[];
  };
  createdAt: string;
}

export interface ScannerSnapshot {
  id: string;
  generatedAt: string;
  online: boolean;
  sessionName: string;
  prioritySymbol: string | null;
  priorityScore: number | null;
  providers: ProviderAuditItem[];
  analysis: unknown;
}

export interface AutomationDecision {
  symbol: string;
  action: "blocked" | "simulate_drive_plan" | "queue_live_order";
  bias: "long" | "short" | "neutral";
  score: number;
  reason: string;
  blockers: string[];
  proposedPlan?: DrivePlan;
  executionOrderId?: string;
  reviewGate?: {
    verdict: "pass" | "warn" | "fail";
    canReview: boolean;
    checks: RiskCheck[];
  };
  generatedAt: string;
}

export interface AutomationCycle {
  id: string;
  mode: "automation";
  status: "locked" | "simulation_only" | "live_execution";
  executionEnabled: boolean;
  dryRun: boolean;
  message: string;
  generatedAt: string;
  session: {
    name: string;
    bias: string;
    canGenerateSetup: boolean;
  };
  globalGates: RiskCheck[];
  globalBlockers: string[];
  providerHealth: {
    failedCount: number;
    failedSources: string[];
  };
  decisions: AutomationDecision[];
  proposedActions: Array<{
    symbol: string;
    action: "review_drive_plan" | "queued_live_order";
    planId: string;
    side: TradeSide;
    score: number;
    executionOrderId?: string;
  }>;
  summary: string;
  nextAction: string;
}

export type DecisionJournalKind = "scanner" | "copilot" | "drive" | "automation" | "risk" | "execution";

export interface DecisionJournalEntry {
  id: string;
  kind: DecisionJournalKind;
  symbol: string | null;
  status: "accepted" | "blocked" | "info" | "error";
  summary: string;
  payload: unknown;
  createdAt: string;
}
