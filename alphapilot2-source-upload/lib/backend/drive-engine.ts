import { addDrivePlan, getLatestMt5Heartbeat, nowIso, riskSettings } from "./seed";
import { getLatestPersistedMt5Heartbeat, listUpcomingEconomicEvents, persistDrivePlan } from "./supabase";
import { createMarketAnalysis } from "./analysis-engine";
import { getExternalMarketContext } from "./data-providers";
import { getBlockingFailedSources } from "./provider-health";
import { scannerHardRules } from "./scanner-policy";
import type { DrivePlan, Mt5Heartbeat, Mt5Tick, TradeSide } from "./types";

const fallbackPrices: Record<string, number> = {
  XAUUSD: 4674.9,
  EURUSD: 1.178,
  GBPUSD: 1.361,
  BTCUSDT: 104000
};

function roundPrice(symbol: string, value: number) {
  if (symbol.includes("JPY")) return Number(value.toFixed(3));
  if (symbol.includes("XAU")) return Number(value.toFixed(2));
  if (symbol.includes("BTC")) return Number(value.toFixed(2));
  return Number(value.toFixed(5));
}

function getLiveTick(symbol: string, heartbeat: Mt5Heartbeat | null): Mt5Tick | null {
  return heartbeat?.symbols.find((tick): tick is Mt5Tick => Boolean(tick && tick.symbol === symbol)) ?? null;
}

function fallbackAtr(symbol: string, price: number) {
  if (symbol.includes("XAU")) return price * 0.0045;
  if (symbol.includes("BTC")) return price * 0.012;
  return price * 0.001;
}

function getPipSize(symbol: string) {
  if (symbol.includes("JPY")) return 0.01;
  if (symbol.includes("XAU")) return 0.1;
  if (symbol.includes("BTC")) return 1;
  return 0.0001;
}

function getPipValuePerLot(symbol: string) {
  if (symbol.includes("XAU")) return 10;
  if (symbol.includes("BTC")) return 1;
  return 10;
}

function estimateSizing(
  symbol: string,
  entryAnchor: number,
  stopLoss: number,
  heartbeat: Mt5Heartbeat | null
): NonNullable<DrivePlan["sizing"]> {
  const accountCurrency = heartbeat?.account?.currency ?? null;
  const accountEquity = heartbeat?.account?.equity ?? null;
  const riskAmount = accountEquity === null ? null : Number(((accountEquity * riskSettings.maxRiskPerTradePct) / 100).toFixed(2));
  const stopDistance = Math.abs(entryAnchor - stopLoss);
  const stopPips = stopDistance / getPipSize(symbol);
  const estimatedLots =
    riskAmount === null || stopPips <= 0 ? null : Number((riskAmount / (stopPips * getPipValuePerLot(symbol))).toFixed(2));

  return {
    accountCurrency,
    accountEquity,
    riskAmount,
    stopDistance: roundPrice(symbol, stopDistance),
    estimatedLots,
    model: "approximate",
    notes: [
      `Sizing uses ${riskSettings.maxRiskPerTradePct}% max risk per trade.`,
      "Lot estimate is approximate and must be confirmed against broker contract specs before live execution.",
      accountCurrency && accountCurrency !== "USD"
        ? `Account currency is ${accountCurrency}; final live sizing needs conversion at execution time.`
        : "USD-quoted pip/point assumptions were used."
    ]
  };
}

function getPlanGeometry(symbol: string, side: TradeSide, mid: number, atrValue: number, support: number | null, resistance: number | null) {
  const direction = side === "long" ? 1 : -1;
  const entryWidth = Math.max(atrValue * 0.12, mid * 0.00008);
  const entryCenter = side === "long" ? mid - atrValue * 0.08 : mid + atrValue * 0.08;
  const entryMin = entryCenter - entryWidth;
  const entryMax = entryCenter + entryWidth;
  const entryAnchor = (entryMin + entryMax) / 2;

  const structuralStop =
    side === "long" && support && support < entryAnchor
      ? support - atrValue * 0.12
      : side === "short" && resistance && resistance > entryAnchor
        ? resistance + atrValue * 0.12
        : null;
  const atrStop = entryAnchor - direction * atrValue;
  const stopLoss =
    structuralStop === null
      ? atrStop
      : side === "long"
        ? Math.min(structuralStop, atrStop)
        : Math.max(structuralStop, atrStop);
  const stopDistance = Math.abs(entryAnchor - stopLoss);

  return {
    entryMin: roundPrice(symbol, Math.min(entryMin, entryMax)),
    entryMax: roundPrice(symbol, Math.max(entryMin, entryMax)),
    stopLoss: roundPrice(symbol, stopLoss),
    targets: [
      roundPrice(symbol, entryAnchor + direction * stopDistance * 2),
      roundPrice(symbol, entryAnchor + direction * stopDistance * 3)
    ],
    rewardRisk: 2
  };
}

export async function createDrivePlan(symbolInput = "XAUUSD"): Promise<DrivePlan> {
  const symbol = symbolInput.toUpperCase();
  const liveHeartbeat = getLatestMt5Heartbeat();
  const [persistedHeartbeat, economicEvents, externalContext] = await Promise.all([
    liveHeartbeat ? Promise.resolve(null) : getLatestPersistedMt5Heartbeat(),
    listUpcomingEconomicEvents(48),
    getExternalMarketContext()
  ]);
  const heartbeat = liveHeartbeat ?? persistedHeartbeat;
  const mergedEconomicEvents = [...(economicEvents ?? []), ...externalContext.economicEvents];
  const analysis = createMarketAnalysis(heartbeat, mergedEconomicEvents, externalContext);
  const market = analysis.markets.find((item) => item.symbol === symbol);
  const failedSources = getBlockingFailedSources(analysis.sourceAudit);

  if (!market) {
    throw new Error(`${symbol} is not available in the live scanner`);
  }

  if (failedSources.length > scannerHardRules.maxFailedSources) {
    throw new Error("Insufficient data. Retry in 5 minutes.");
  }

  if (analysis.session.canGenerateSetup === false) {
    throw new Error("Outside active session window");
  }

  if (market.riskClearance.status === "news_blackout") {
    throw new Error("NEWS BLACKOUT: Drive plan generation is blocked");
  }

  if (market.score < scannerHardRules.minimumScore) {
    throw new Error(`${symbol} is below the ${scannerHardRules.minimumScore}/10 Drive threshold`);
  }

  if (market.bias === "neutral") {
    throw new Error(`${symbol} is neutral right now; monitor only`);
  }

  const liveTick = getLiveTick(symbol, heartbeat);
  const mid = liveTick ? (liveTick.bid + liveTick.ask) / 2 : fallbackPrices[symbol] ?? fallbackPrices.XAUUSD;
  const spread = liveTick ? liveTick.ask - liveTick.bid : 0;
  const side = market.bias === "short" ? "short" : "long";
  const atrValue = market.structure.atr14 ?? fallbackAtr(symbol, mid);
  const geometry = getPlanGeometry(symbol, side, mid, atrValue, market.structure.support, market.structure.resistance);
  const entryAnchor = (geometry.entryMin + geometry.entryMax) / 2;
  const sizing = estimateSizing(symbol, entryAnchor, geometry.stopLoss, heartbeat);
  const confidence = market.score >= 8 ? "high" : market.score >= 7 ? "medium" : "low";
  const riskClearance =
    market.riskClearance.status === "caution" && market.riskClearance.nearestEvent
      ? `High-impact ${market.riskClearance.nearestEvent.currency} event in ${market.riskClearance.nearestEvent.minutesUntil} minutes.`
      : "No high-impact event inside the blackout window.";

  const plan = addDrivePlan({
    id: `plan_${Date.now()}`,
    symbol,
    side,
    status: "review_ready",
    score: market.score,
    confidence,
    entry: {
      min: geometry.entryMin,
      max: geometry.entryMax
    },
    stopLoss: geometry.stopLoss,
    targets: geometry.targets,
    riskPct: riskSettings.maxRiskPerTradePct,
    rewardRisk: geometry.rewardRisk,
    source: liveTick && heartbeat?.candles?.length ? "mt5_live" : "demo_snapshot",
    rationale: [
      `${symbol} passed the live scanner at ${market.score.toFixed(1)}/10 with ${market.bias.toUpperCase()} bias.`,
      `Structure is ${market.structure.emaStack} EMA stack, ${market.structure.h4Trend} 4H trend, ${market.structure.dayTrend} daily trend.`,
      `Nearest structure: support ${roundPrice(symbol, market.structure.support ?? 0)}, resistance ${roundPrice(symbol, market.structure.resistance ?? 0)}, ATR ${roundPrice(symbol, atrValue)}.`,
      liveTick ? `Live MT5 tick was used for the price anchor; current spread is ${roundPrice(symbol, spread)}.` : "No fresh MT5 tick found, so the plan used a demo snapshot.",
      heartbeat?.account ? `Account telemetry is online on ${heartbeat.account.server}; plan is read-only and does not execute.` : "Account telemetry is unavailable, so execution stays locked."
    ],
    riskNotes: [
      `Risk capped at ${riskSettings.maxRiskPerTradePct}% per trade.`,
      sizing.riskAmount === null
        ? "Account equity was unavailable, so lot sizing is estimate-only."
        : `Approx risk amount is ${sizing.riskAmount} ${sizing.accountCurrency ?? "account currency"}; estimated size ${sizing.estimatedLots ?? "n/a"} lots.`,
      `Session: ${analysis.session.name} (${analysis.session.bias}).`,
      riskClearance,
      `Minimum target is ${geometry.rewardRisk}:1 reward-to-risk.`,
      "Automation remains locked; this plan does not place orders."
    ],
    sizing,
    createdAt: nowIso()
  });

  void persistDrivePlan(plan);
  return plan;
}
