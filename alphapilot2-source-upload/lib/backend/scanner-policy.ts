export const scannerPolicyVersion = "alphapilot-scanner-v1.0";

export const scannerSources = [
  {
    id: "mt5",
    label: "Vantage MT5",
    purpose: "Live bid/ask, account telemetry, open positions and broker-side symbol availability.",
    envKeys: []
  },
  {
    id: "myfxbook",
    label: "Myfxbook Community Outlook",
    purpose: "Retail long/short positioning and volume-weighted contrarian sentiment.",
    envKeys: ["MYFXBOOK_EMAIL", "MYFXBOOK_PASSWORD"]
  },
  {
    id: "forex_factory",
    label: "Forex Factory Calendar",
    purpose: "High-impact event detection and 45-minute news blackout enforcement.",
    envKeys: ["FOREX_FACTORY_CALENDAR_URL"]
  },
  {
    id: "manual_calendar",
    label: "Manual High-Impact Calendar",
    purpose: "Free fallback calendar events entered by the AlphaPilot operator.",
    envKeys: []
  },
  {
    id: "market_structure",
    label: "Market Structure/OHLCV Provider",
    purpose: "Multi-timeframe trend, levels, ATR, volume and EMA stack.",
    envKeys: ["ALPHA_VANTAGE_API_KEY", "FINNHUB_API_KEY", "MARKET_DATA_API_KEY", "MARKET_DATA_PROVIDER"]
  },
  {
    id: "dxy",
    label: "DXY Feed",
    purpose: "Dollar index direction and macro bias for EUR, GBP and Gold.",
    envKeys: ["ALPHA_VANTAGE_API_KEY", "DXY_DATA_PROVIDER", "DXY_DATA_API_KEY"]
  },
  {
    id: "coinglass",
    label: "Crypto Depth",
    purpose: "Free crypto public data: Binance funding/open interest, Hyperliquid perps context and Kraken spot backup.",
    envKeys: []
  },
  {
    id: "fred",
    label: "FRED",
    purpose: "US rates, CPI and 10Y yield context.",
    envKeys: ["FRED_API_KEY"]
  },
  {
    id: "news",
    label: "Finnhub News",
    purpose: "Recent financial headlines and sentiment classification.",
    envKeys: ["FINNHUB_API_KEY", "NEWSAPI_AI_KEY"]
  },
  {
    id: "fear_greed",
    label: "Fear & Greed",
    purpose: "Alternative.me crypto risk-on/risk-off sentiment for BTC and crypto pairs.",
    envKeys: ["FEAR_GREED_PROVIDER"]
  },
  {
    id: "sec_insider",
    label: "SEC API Insider Trading",
    purpose: "US equity insider activity as broad-market risk appetite context.",
    envKeys: ["SEC_API_KEY"]
  },
  {
    id: "usaspending",
    label: "USAspending",
    purpose: "US federal spending and award-flow context as a macro liquidity input.",
    envKeys: []
  },
  {
    id: "treasury_fiscal",
    label: "Treasury Fiscal Data",
    purpose: "US debt and fiscal pressure context for USD and macro risk analysis.",
    envKeys: []
  }
] as const;

export const scannerHardRules = {
  minimumScore: 7,
  newsBlackoutMinutes: 45,
  maxFailedSources: 2,
  deadZoneUtc: {
    startHour: 21,
    endHour: 0
  },
  frontendShowsSources: false,
  backendAuditsSources: true
};

export function getActiveSession(date = new Date()) {
  const hour = date.getUTCHours();

  if (hour >= 0 && hour < 7) return { name: "Asia", bias: "low liquidity, range bias", canGenerateSetup: true };
  if (hour >= 7 && hour < 12) return { name: "London", bias: "high liquidity, breakout bias", canGenerateSetup: true };
  if (hour >= 12 && hour < 17) return { name: "London/NY", bias: "highest liquidity, trend continuation", canGenerateSetup: true };
  if (hour >= 17 && hour < 21) return { name: "NY Afternoon", bias: "fading volume, avoid new positions", canGenerateSetup: true };
  return { name: "Dead Zone", bias: "do not generate setups", canGenerateSetup: false };
}

export function getScannerPrompt() {
  return `You are AlphaPilot AI's live trade scanner. Fetch fresh data for every scan, audit source status internally, and never show source references on the frontend. Use strategy rules as the driver, AI narrative as the analyst layer, and risk controls as the final gate.`;
}
