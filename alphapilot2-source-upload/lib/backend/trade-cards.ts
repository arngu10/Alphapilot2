import { createMarketAnalysis } from "./analysis-engine";
import { getLatestIntelligence } from "./intelligence-engine";

type AnalysisPayload = ReturnType<typeof createMarketAnalysis>;
type Market = AnalysisPayload["markets"][number];

function titleForSymbol(symbol: string) {
  if (symbol === "XAUUSD") return "Gold";
  if (symbol === "EURUSD") return "Euro / US Dollar";
  if (symbol === "GBPUSD") return "British Pound / US Dollar";
  if (symbol === "BTCUSDT") return "Bitcoin / Tether";
  return symbol;
}

function statusForMarket(market: Market, analysis: AnalysisPayload) {
  if (!analysis.session.canGenerateSetup) return "halted";
  if (market.riskClearance.status === "news_blackout") return "blackout";
  if (market.score >= analysis.hardRules.minimumScore && market.bias !== "neutral") return "drive_ready";
  if (market.riskClearance.status === "caution") return "caution";
  return "watching";
}

function actionLabel(status: ReturnType<typeof statusForMarket>) {
  if (status === "drive_ready") return "Generate Drive plan";
  if (status === "blackout") return "News blackout";
  if (status === "halted") return "Session halted";
  if (status === "caution") return "Review caution";
  return "Ask Copilot";
}

function marketSummary(market: Market, analysis: AnalysisPayload) {
  if (!analysis.session.canGenerateSetup) return "Outside active session window. Keep this on watch only.";
  if (market.riskClearance.status === "news_blackout") return "High-impact news is too close. No setup should be generated.";
  if (market.bias === "neutral") return "No clear bias yet. Wait for structure or macro alignment.";
  if (market.score >= analysis.hardRules.minimumScore) {
    return `${market.bias.toUpperCase()} bias with enough scanner quality for Drive review.`;
  }
  return `${market.bias.toUpperCase()} bias, but score is below the AlphaPilot setup threshold.`;
}

export async function getTradeCards() {
  const intelligence = await getLatestIntelligence();
  const analysis = intelligence.scanner as AnalysisPayload;

  const cards = analysis.markets.map((market) => {
    const status = statusForMarket(market, analysis);
    const nearestEvent = market.riskClearance.nearestEvent;

    return {
      symbol: market.symbol,
      title: titleForSymbol(market.symbol),
      status,
      actionLabel: actionLabel(status),
      bias: market.bias,
      score: market.score,
      bid: market.bid,
      ask: market.ask,
      spread: market.spread,
      session: analysis.session.name,
      support: market.structure.support,
      resistance: market.structure.resistance,
      atr14: market.structure.atr14,
      structure: {
        timeframe: market.structure.timeframe,
        quality: market.structure.structureQuality,
        emaStack: market.structure.emaStack,
        dayTrend: market.structure.dayTrend,
        h4Trend: market.structure.h4Trend
      },
      risk: {
        clearance: market.riskClearance.status,
        nearestEvent: nearestEvent
          ? {
              title: nearestEvent.title,
              currency: nearestEvent.currency,
              startsAt: nearestEvent.startsAt,
              minutesUntil: nearestEvent.minutesUntil
            }
          : null
      },
      summary: marketSummary(market, analysis),
      badges: [
        analysis.session.name,
        market.structure.emaStack,
        market.riskClearance.status,
        market.score >= analysis.hardRules.minimumScore ? "score_ok" : "score_low"
      ],
      notes: market.notes.slice(0, 4)
    };
  });

  return {
    generatedAt: intelligence.generatedAt,
    source: intelligence.source,
    session: analysis.session,
    automationLocked: intelligence.modes.automation === "locked",
    cards,
    priority: cards.find((card) => card.symbol === intelligence.priority?.symbol) ?? cards[0] ?? null
  };
}
