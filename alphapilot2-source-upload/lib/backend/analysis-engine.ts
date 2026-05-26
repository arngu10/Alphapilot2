import type {
  EconomicEvent,
  ExternalMarketContext,
  Mt5Candle,
  Mt5Heartbeat,
  Mt5SymbolCandles,
  Mt5Tick,
  ProviderStatus
} from "./types";
import { getActiveSession, scannerHardRules, scannerPolicyVersion, scannerSources } from "./scanner-policy";

const trackedSymbols = ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSDT"];

function pricePrecision(symbol: string) {
  if (symbol.includes("XAU") || symbol.includes("BTC")) return 2;
  if (symbol.includes("JPY")) return 3;
  return 5;
}

function cleanTicks(heartbeat: Mt5Heartbeat | null): Mt5Tick[] {
  return (
    heartbeat?.symbols.filter((tick): tick is Mt5Tick => Boolean(tick && trackedSymbols.includes(tick.symbol))) ?? []
  );
}

function getSpreadScore(symbol: string, tick: Mt5Tick) {
  const spread = Math.max(tick.ask - tick.bid, 0);
  const mid = (tick.ask + tick.bid) / 2;
  const spreadBps = mid > 0 ? (spread / mid) * 10000 : 999;

  if (symbol.includes("XAU")) return spreadBps <= 1.2 ? 8 : spreadBps <= 2.2 ? 6 : 4;
  if (symbol.includes("BTC")) return spreadBps <= 2.5 ? 7 : spreadBps <= 5 ? 5 : 3;
  return spreadBps <= 0.8 ? 8 : spreadBps <= 1.4 ? 6 : 4;
}

function getSymbolBias(symbol: string): "long" | "short" | "neutral" {
  if (symbol === "GBPUSD") return "neutral";
  if (symbol === "BTCUSDT") return "neutral";
  return "long";
}

function getContextBias(symbol: string, context: ExternalMarketContext | null): "long" | "short" | "neutral" {
  if (!context?.macro) return getSymbolBias(symbol);

  const usdSensitive = symbol === "XAUUSD" || symbol === "EURUSD" || symbol === "GBPUSD";
  if (!usdSensitive) return getSymbolBias(symbol);
  if (context.macro.bias === "usd_bullish") return "short";
  if (context.macro.bias === "usd_bearish") return "long";
  return getSymbolBias(symbol);
}

function getSentimentScore(symbol: string, context: ExternalMarketContext | null) {
  const sentiment = context?.sentiment.find((item) => item.symbol === symbol);
  const news = context?.news.find((item) => item.symbol === symbol);
  const sentimentBias = sentiment?.contrarianBias ?? "neutral";
  const newsTone = news?.tone ?? "unknown";
  const newsDirection = newsTone === "bullish" ? "long" : newsTone === "bearish" ? "short" : "neutral";

  if (!sentiment && !news) {
    return {
      score: 5,
      note: "Sentiment layer is waiting for provider data."
    };
  }

  const confluence =
    sentimentBias !== "neutral" && newsTone !== "unknown" && newsDirection !== "neutral" && sentimentBias === newsDirection;
  const conflict =
    sentimentBias !== "neutral" && newsTone !== "unknown" && newsDirection !== "neutral" && sentimentBias !== newsDirection;

  return {
    score: confluence ? 8 : conflict ? 4 : 6,
    note: sentiment
      ? `Sentiment: Myfxbook retail ${sentiment.longPercentage ?? "?"}% long / ${sentiment.shortPercentage ?? "?"}% short; contrarian read ${sentiment.contrarianBias}. News tone ${newsTone}.`
      : `Sentiment: news tone ${newsTone}; Myfxbook waiting for data.`
  };
}

function getMacroNote(symbol: string, context: ExternalMarketContext | null) {
  const macro = context?.macro;
  if (!macro) return "Macro layer is waiting for provider data.";

  const dxy = macro.dxyDirection === "unknown" ? "DXY unavailable" : `DXY ${macro.dxyDirection}`;
  const yieldText =
    macro.tenYearYield === null ? "10Y yield unavailable" : `10Y yield ${macro.tenYearYield}% and ${macro.tenYearDirection}`;
  const applies = symbol === "XAUUSD" || symbol === "EURUSD" || symbol === "GBPUSD";
  const bias = applies ? `macro bias ${macro.bias}` : "macro context monitored";
  return `Macro: ${dxy}; ${yieldText}; ${bias}.`;
}

function getPublicFlowNote(context: ExternalMarketContext | null) {
  const flow = context?.publicFlow;
  if (!flow) return "Public-flow layer is waiting for SEC, USAspending and Treasury data.";

  return `Public flow: ${flow.summary}.`;
}

function getCryptoDepthScore(symbol: string, context: ExternalMarketContext | null) {
  if (symbol !== "BTCUSDT") {
    return {
      score: 5,
      note: null
    };
  }

  const primary = context?.cryptoDepth.find((item) => item.symbol === "BTCUSDT" && item.provider === "binance");
  const hyperliquid = context?.cryptoDepth.find((item) => item.symbol === "BTCUSDT" && item.provider === "hyperliquid");
  const backup = context?.cryptoDepth.find((item) => item.symbol === "BTCUSDT" && item.provider === "kraken");
  const depth = primary ?? hyperliquid ?? backup;
  const fearGreed = context?.fearGreed;

  if (!depth) {
    return {
      score: 5,
      note: "Crypto depth layer is waiting for Binance/Kraken public data."
    };
  }

  const depthScore = depth.bias === "bullish" ? 7 : depth.bias === "bearish" ? 4 : 5;
  const sentimentScore = fearGreed?.riskMode === "risk_on" ? 7 : fearGreed?.riskMode === "risk_off" ? 4 : 5;
  const score = Math.round((depthScore * 0.65 + sentimentScore * 0.35) * 10) / 10;
  const change = depth.priceChange24hPct === null ? "24h change unavailable" : `${depth.priceChange24hPct.toFixed(2)}% 24h`;
  const funding = depth.fundingRate === null ? "funding unavailable" : `funding ${depth.fundingRate}`;
  const oi = depth.openInterest === null ? "OI unavailable" : `OI ${Math.round(depth.openInterest).toLocaleString("en-US")}`;
  const sentiment =
    fearGreed?.score === null || !fearGreed
      ? "fear/greed unavailable"
      : `fear/greed ${fearGreed.score} ${fearGreed.classification ?? ""} (${fearGreed.riskMode})`;

  return {
    score,
    note: `Crypto depth: ${depth.provider} price ${depth.price ?? "?"}, ${change}, ${funding}, ${oi}, bias ${depth.bias}; ${sentiment}.`
  };
}

function getSymbolCurrencies(symbol: string) {
  if (symbol === "XAUUSD") return ["USD"];
  if (symbol === "BTCUSDT") return ["BTC", "USD", "USDT"];
  if (symbol.length >= 6) return [symbol.slice(0, 3), symbol.slice(3, 6)];
  return [symbol];
}

function getRiskClearance(symbol: string, events: EconomicEvent[], date = new Date()) {
  const currencies = new Set(getSymbolCurrencies(symbol));
  const nowMs = date.getTime();
  const windowEndMs = nowMs + 48 * 60 * 60 * 1000;
  const relevantEvents = events
    .filter((event) => event.impact === "high")
    .filter((event) => currencies.has(event.currency.toUpperCase()))
    .map((event) => ({
      ...event,
      minutesUntil: Math.round((new Date(event.startsAt).getTime() - nowMs) / 60000)
    }))
    .filter((event) => {
      const eventMs = new Date(event.startsAt).getTime();
      return eventMs >= nowMs && eventMs <= windowEndMs;
    })
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  const nearestEvent = relevantEvents[0] ?? null;
  const minutesUntil = nearestEvent?.minutesUntil ?? null;
  const status =
    minutesUntil !== null && minutesUntil <= scannerHardRules.newsBlackoutMinutes
      ? "news_blackout"
      : minutesUntil !== null && minutesUntil <= 120
        ? "caution"
        : "clear";

  return {
    status,
    nearestEvent: nearestEvent
      ? {
          title: nearestEvent.title,
          currency: nearestEvent.currency,
          startsAt: nearestEvent.startsAt,
          minutesUntil: nearestEvent.minutesUntil
        }
      : null
  };
}

function ema(values: number[], period: number) {
  if (values.length === 0) return null;
  const multiplier = 2 / (period + 1);
  return values.reduce((previous, value, index) => {
    if (index === 0) return value;
    return value * multiplier + previous * (1 - multiplier);
  }, values[0]);
}

function atr(candles: Mt5Candle[], period = 14) {
  if (candles.length < 2) return null;
  const slice = candles.slice(-period - 1);
  const ranges = slice.slice(1).map((candle, index) => {
    const previousClose = slice[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  if (ranges.length === 0) return null;
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function getCandleSet(symbol: string, candleSets: Mt5SymbolCandles[] | undefined) {
  return candleSets?.find((item) => item.symbol === symbol) ?? null;
}

function analyzeStructure(symbol: string, candleSet: Mt5SymbolCandles | null) {
  const primary = candleSet?.timeframes.H1?.length ? candleSet.timeframes.H1 : candleSet?.timeframes.M15 ?? [];
  const daily = candleSet?.timeframes.D1 ?? [];
  const h4 = candleSet?.timeframes.H4 ?? [];
  const closes = primary.map((candle) => candle.close);
  const latest = primary.at(-1) ?? null;
  const ema20 = ema(closes.slice(-80), 20);
  const ema50 = ema(closes.slice(-120), 50);
  const ema200 = ema(closes, 200);
  const atr14 = atr(primary);
  const recent = primary.slice(-40);
  const averageVolume = recent.length ? recent.reduce((sum, candle) => sum + candle.tick_volume, 0) / recent.length : null;
  const volumeRatio = latest && averageVolume ? latest.tick_volume / averageVolume : null;
  const support = recent.length ? Math.min(...recent.map((candle) => candle.low)) : null;
  const resistance = recent.length ? Math.max(...recent.map((candle) => candle.high)) : null;
  const h4Trend =
    h4.length >= 12 && h4.at(-1)!.close > h4.at(-12)!.close ? "bullish" : h4.length >= 12 ? "bearish" : "unknown";
  const dayTrend =
    daily.length >= 5 && daily.at(-1)!.close > daily.at(-5)!.close ? "bullish" : daily.length >= 5 ? "bearish" : "unknown";
  const emaStack =
    ema20 && ema50 && ema200
      ? ema20 > ema50 && ema50 > ema200
        ? "bullish"
        : ema20 < ema50 && ema50 < ema200
          ? "bearish"
          : "mixed"
      : "unknown";

  const score =
    emaStack === "unknown"
      ? 5
      : Math.min(
          10,
          Math.max(
            3,
            5 +
              (emaStack === "bullish" || emaStack === "bearish" ? 2 : 0) +
              (h4Trend === dayTrend && h4Trend !== "unknown" ? 1 : 0) +
              (volumeRatio && volumeRatio > 1.1 ? 1 : 0)
          )
        );

  return {
    timeframe: primary === candleSet?.timeframes.H1 ? "H1" : "M15",
    dayTrend,
    h4Trend,
    emaStack,
    structureQuality: score,
    atr14: atr14 ? Number(atr14.toFixed(pricePrecision(symbol))) : null,
    support: support ? Number(support.toFixed(pricePrecision(symbol))) : null,
    resistance: resistance ? Number(resistance.toFixed(pricePrecision(symbol))) : null,
    volumeRatio: volumeRatio ? Number(volumeRatio.toFixed(2)) : null
  };
}

export function createMarketAnalysis(
  heartbeat: Mt5Heartbeat | null,
  economicEvents: EconomicEvent[] = [],
  externalContext: ExternalMarketContext | null = null
) {
  const ticks = cleanTicks(heartbeat);
  const online = Boolean(heartbeat?.ok && ticks.length > 0);
  const account = heartbeat?.account ?? null;
  const session = getActiveSession();
  const getStaticSourceStatus = (sourceId: string): ProviderStatus => {
    if (sourceId === "mt5") return online ? "fetched" : "failed";
    if (sourceId === "manual_calendar") return economicEvents.length > 0 ? "fetched" : "empty";
    return "not_configured";
  };

  const markets = ticks.map((tick) => {
    const mid = (tick.bid + tick.ask) / 2;
    const spread = tick.ask - tick.bid;
    const spreadScore = getSpreadScore(tick.symbol, tick);
    const bias = getContextBias(tick.symbol, externalContext);
    const score = Math.min(9, Math.max(4, spreadScore + (bias === "neutral" ? -1 : 0)));
    const structure = analyzeStructure(tick.symbol, getCandleSet(tick.symbol, heartbeat?.candles));
    const riskClearance = getRiskClearance(tick.symbol, economicEvents);
    const newsScore = riskClearance.status === "news_blackout" ? 0 : riskClearance.status === "caution" ? 5 : 10;
    const sentiment = getSentimentScore(tick.symbol, externalContext);
    const cryptoDepth = getCryptoDepthScore(tick.symbol, externalContext);
    const rawScore =
      tick.symbol === "BTCUSDT"
        ? score * 0.2 + structure.structureQuality * 0.35 + newsScore * 0.15 + sentiment.score * 0.1 + cryptoDepth.score * 0.2
        : score * 0.25 + structure.structureQuality * 0.4 + newsScore * 0.2 + sentiment.score * 0.15;
    const combinedScore =
      riskClearance.status === "news_blackout" ? Math.min(6.9, Math.round(rawScore * 10) / 10) : Math.round(rawScore * 10) / 10;
    const riskNote =
      riskClearance.status === "news_blackout"
        ? `NEWS BLACKOUT: ${riskClearance.nearestEvent?.currency} ${riskClearance.nearestEvent?.title} in ${riskClearance.nearestEvent?.minutesUntil} minutes.`
        : riskClearance.status === "caution"
          ? `High-impact news caution: ${riskClearance.nearestEvent?.currency} ${riskClearance.nearestEvent?.title} in ${riskClearance.nearestEvent?.minutesUntil} minutes.`
          : "Risk clearance: no high-impact event inside the blackout window.";

    return {
      symbol: tick.symbol,
      bid: Number(tick.bid.toFixed(pricePrecision(tick.symbol))),
      ask: Number(tick.ask.toFixed(pricePrecision(tick.symbol))),
      mid: Number(mid.toFixed(pricePrecision(tick.symbol))),
      spread: Number(spread.toFixed(pricePrecision(tick.symbol))),
      bias,
      score: combinedScore,
      structure,
      riskClearance,
      verdict:
        session.canGenerateSetup === false
          ? "Outside active session window."
          : riskClearance.status === "news_blackout"
            ? "NEWS BLACKOUT: no setup generated."
          : combinedScore < scannerHardRules.minimumScore
            ? "Below AlphaPilot setup threshold; monitor only."
            : bias === "neutral"
          ? "Monitor only until structure improves."
          : "Eligible for Drive review; require manual confirmation before execution.",
      notes: [
        `Session: ${session.name} (${session.bias}).`,
        getMacroNote(tick.symbol, externalContext),
        getPublicFlowNote(externalContext),
        `Structure: ${structure.emaStack} EMA stack, ${structure.h4Trend} 4H trend, quality ${structure.structureQuality}/10.`,
        sentiment.note,
        ...(cryptoDepth.note ? [cryptoDepth.note] : []),
        riskNote,
        spreadScore >= 7 ? "Spread is acceptable for planning." : "Spread is elevated; reduce conviction.",
        "Analysis is telemetry-based v1, not live execution advice.",
        "Automation remains locked until vault and audit controls are complete."
      ]
    };
  });

  const priority =
    markets.find((market) => market.symbol === "XAUUSD") ??
    markets.find((market) => market.symbol === "EURUSD") ??
    markets[0] ??
    null;

  return {
    policyVersion: scannerPolicyVersion,
    online,
    generatedAt: new Date().toISOString(),
    session,
    hardRules: scannerHardRules,
    sourceAudit: [
      ...scannerSources.map((source) => ({
        id: source.id,
        label: source.label,
        status: getStaticSourceStatus(source.id),
        fetchedAt: source.id === "mt5" && online ? heartbeat?.timestamp ?? new Date().toISOString() : null,
        frontendVisible: false as const
      })),
      ...(externalContext?.audit ?? [])
    ],
    connector: {
      id: "vantage-mt5",
      status: online ? "connected" : "offline",
      server: account?.server ?? null,
      company: account?.company ?? null,
      currency: account?.currency ?? null
    },
    account: account
      ? {
          login: account.login,
          balance: account.balance,
          equity: account.equity,
          margin: account.margin,
          marginFree: account.margin_free,
          leverage: account.leverage
        }
      : null,
    summary: online
      ? `${markets.length} live markets are feeding AlphaPilot. ${priority?.symbol ?? "Primary market"} is the current Drive priority.`
      : "MT5 telemetry is offline, so analysis is paused.",
    priority,
    markets
  };
}
