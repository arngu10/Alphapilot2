import type {
  CryptoDepthReading,
  EconomicEvent,
  ExternalMarketContext,
  FearGreedReading,
  MacroReading,
  NewsReading,
  ProviderAuditItem,
  PublicFlowReading,
  SentimentReading
} from "./types";

const DEFAULT_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSDT"];
const FRED_SERIES = {
  fedFunds: "FEDFUNDS",
  cpi: "CPIAUCSL",
  tenYear: "DGS10"
};

function nowIso() {
  return new Date().toISOString();
}

function audit(
  id: string,
  label: string,
  status: ProviderAuditItem["status"],
  fetchedAt: string | null,
  detail?: string
): ProviderAuditItem {
  return {
    id,
    label,
    status,
    fetchedAt,
    detail,
    frontendVisible: false
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  if (value.trim() === "." || value.trim() === "") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "AlphaPilot/0.1"
      }
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson<T>(url: string, body: unknown, timeoutMs = 8000, headers: Record<string, string> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AlphaPilot/0.1",
        ...headers
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "AlphaPilot/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function symbolTerms(symbol: string) {
  if (symbol === "XAUUSD") return ["gold", "xauusd", "xau", "usd"];
  if (symbol === "BTCUSDT") return ["bitcoin", "btc", "crypto"];
  if (symbol === "EURUSD") return ["eurusd", "euro", "ecb", "usd"];
  if (symbol === "GBPUSD") return ["gbpusd", "pound", "sterling", "boe", "usd"];
  return [symbol.toLowerCase()];
}

function compactDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currencyFromCountry(country: string | undefined) {
  const normalized = (country ?? "").toLowerCase();
  if (["us", "usa", "united states"].includes(normalized)) return "USD";
  if (["uk", "gb", "great britain", "united kingdom"].includes(normalized)) return "GBP";
  if (["eu", "euro area", "eurozone", "european union"].includes(normalized)) return "EUR";
  if (["jp", "japan"].includes(normalized)) return "JPY";
  if (["ca", "canada"].includes(normalized)) return "CAD";
  if (["au", "australia"].includes(normalized)) return "AUD";
  if (["nz", "new zealand"].includes(normalized)) return "NZD";
  if (["ch", "switzerland"].includes(normalized)) return "CHF";
  return normalized.slice(0, 3).toUpperCase() || "USD";
}

function normalizeImpact(value: unknown): EconomicEvent["impact"] {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("high") || text === "3") return "high";
  if (text.includes("medium") || text === "2") return "medium";
  return "low";
}

function fiscalYearStart() {
  const now = new Date();
  const year = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${year}-10-01`;
}

function publicFlowSummary(flow: PublicFlowReading) {
  const parts = [
    flow.secInsider.bias === "unknown"
      ? "SEC insider activity unavailable"
      : `SEC insider bias ${flow.secInsider.bias}`,
    flow.federalSpending.obligationTotal === null
      ? "USAspending flow unavailable"
      : `federal obligations ${Math.round(flow.federalSpending.obligationTotal).toLocaleString("en-US")}`,
    flow.treasuryFiscal.publicDebt === null
      ? "Treasury debt unavailable"
      : `public debt ${flow.treasuryFiscal.direction}`
  ];

  return parts.join("; ");
}

async function fetchBinanceCryptoDepth(): Promise<{ cryptoDepth: CryptoDepthReading[]; audit: ProviderAuditItem }> {
  try {
    const [ticker, funding, openInterest] = await Promise.all([
      fetchJson<{
        lastPrice?: string;
        priceChangePercent?: string;
        volume?: string;
        quoteVolume?: string;
      }>("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"),
      fetchJson<Array<{ fundingRate?: string }>>("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1"),
      fetchJson<{ openInterest?: string }>("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT")
    ]);

    const priceChange24hPct = asNumber(ticker.priceChangePercent);
    const fundingRate = asNumber(funding[0]?.fundingRate);
    const bias =
      priceChange24hPct === null
        ? "unknown"
        : priceChange24hPct > 0 && (fundingRate ?? 0) >= -0.0001
          ? "bullish"
          : priceChange24hPct < 0
            ? "bearish"
            : "neutral";

    return {
      cryptoDepth: [
        {
          symbol: "BTCUSDT",
          provider: "binance",
          price: asNumber(ticker.lastPrice),
          priceChange24hPct,
          volume24h: asNumber(ticker.quoteVolume) ?? asNumber(ticker.volume),
          fundingRate,
          openInterest: asNumber(openInterest.openInterest),
          bias
        }
      ],
      audit: audit("binance", "Binance Public Market Data", "fetched", nowIso())
    };
  } catch (error) {
    return { cryptoDepth: [], audit: audit("binance", "Binance Public Market Data", "failed", nowIso(), String(error)) };
  }
}

async function fetchKrakenCryptoDepth(): Promise<{ cryptoDepth: CryptoDepthReading[]; audit: ProviderAuditItem }> {
  try {
    const payload = await fetchJson<{
      result?: Record<
        string,
        {
          c?: string[];
          p?: string[];
          v?: string[];
        }
      >;
    }>("https://api.kraken.com/0/public/Ticker?pair=XBTUSDT");

    const row = Object.values(payload.result ?? {})[0];
    if (!row) {
      return { cryptoDepth: [], audit: audit("kraken", "Kraken Public Market Data", "empty", nowIso()) };
    }

    return {
      cryptoDepth: [
        {
          symbol: "BTCUSDT",
          provider: "kraken",
          price: asNumber(row.c?.[0]),
          priceChange24hPct: null,
          volume24h: asNumber(row.v?.[1]),
          fundingRate: null,
          openInterest: null,
          bias: "unknown"
        }
      ],
      audit: audit("kraken", "Kraken Public Market Data", "fetched", nowIso())
    };
  } catch (error) {
    return { cryptoDepth: [], audit: audit("kraken", "Kraken Public Market Data", "failed", nowIso(), String(error)) };
  }
}

async function fetchHyperliquidCryptoDepth(): Promise<{ cryptoDepth: CryptoDepthReading[]; audit: ProviderAuditItem }> {
  try {
    const [mids, metaAndCtxs] = await Promise.all([
      postJson<Record<string, string>>("https://api.hyperliquid.xyz/info", { type: "allMids" }),
      postJson<
        [
          { universe?: Array<{ name: string }> },
          Array<{ funding?: string; openInterest?: string; dayNtlVlm?: string; prevDayPx?: string; midPx?: string }>
        ]
      >("https://api.hyperliquid.xyz/info", { type: "metaAndAssetCtxs" })
    ]);

    const universe = metaAndCtxs[0]?.universe ?? [];
    const contexts = metaAndCtxs[1] ?? [];
    const btcIndex = universe.findIndex((item) => item.name === "BTC");
    const btcContext = btcIndex >= 0 ? contexts[btcIndex] : null;
    const price = asNumber(mids.BTC) ?? asNumber(btcContext?.midPx);
    const previous = asNumber(btcContext?.prevDayPx);
    const priceChange24hPct = price !== null && previous ? ((price - previous) / previous) * 100 : null;
    const fundingRate = asNumber(btcContext?.funding);
    const bias =
      priceChange24hPct === null
        ? "unknown"
        : priceChange24hPct > 0 && (fundingRate ?? 0) >= -0.0001
          ? "bullish"
          : priceChange24hPct < 0
            ? "bearish"
            : "neutral";

    return {
      cryptoDepth: [
        {
          symbol: "BTCUSDT",
          provider: "hyperliquid",
          price,
          priceChange24hPct: priceChange24hPct === null ? null : Number(priceChange24hPct.toFixed(2)),
          volume24h: asNumber(btcContext?.dayNtlVlm),
          fundingRate,
          openInterest: asNumber(btcContext?.openInterest),
          bias
        }
      ],
      audit: audit("hyperliquid", "Hyperliquid Public Market Data", "fetched", nowIso())
    };
  } catch (error) {
    return { cryptoDepth: [], audit: audit("hyperliquid", "Hyperliquid Public Market Data", "failed", nowIso(), String(error)) };
  }
}

async function fetchAlternativeFearGreed(): Promise<{ fearGreed: FearGreedReading | null; audit: ProviderAuditItem }> {
  try {
    const payload = await fetchJson<{
      data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>;
    }>("https://api.alternative.me/fng/?limit=2&format=json");
    const latest = payload.data?.[0];
    const previous = payload.data?.[1];
    const score = asNumber(latest?.value);
    const previousScore = asNumber(previous?.value);
    const direction =
      score === null || previousScore === null ? "unknown" : score > previousScore ? "improving" : score < previousScore ? "worsening" : "flat";
    const riskMode = score === null ? "neutral" : score < 30 ? "risk_off" : score > 70 ? "risk_on" : "neutral";

    return {
      fearGreed: {
        score,
        classification: latest?.value_classification ?? null,
        direction,
        riskMode
      },
      audit: audit("alternative_fng", "Alternative.me Fear and Greed", score === null ? "empty" : "fetched", nowIso())
    };
  } catch (error) {
    return { fearGreed: null, audit: audit("alternative_fng", "Alternative.me Fear and Greed", "failed", nowIso(), String(error)) };
  }
}

async function fetchSecInsiderFlow(): Promise<{ reading: PublicFlowReading["secInsider"]; audit: ProviderAuditItem }> {
  const apiKey = process.env.SEC_API_KEY;
  if (!apiKey) {
    return {
      reading: {
        totalFilings: null,
        purchaseCount: null,
        saleCount: null,
        bias: "unknown"
      },
      audit: audit("sec_insider", "SEC API Insider Trading", "not_configured", null)
    };
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const payload = await postJson<{
      total?: { value?: number };
      transactions?: Array<{ transactionCode?: string }>;
      filings?: Array<{ transactionCode?: string }>;
    }>(
      "https://api.sec-api.io/insider-trading",
      {
        query: `periodOfReport:[${sevenDaysAgo} TO *] AND issuer.tradingSymbol:(SPY OR QQQ OR GLD OR COIN OR MSTR)`,
        from: "0",
        size: "50",
        sort: [{ filedAt: { order: "desc" } }]
      },
      9000,
      {
        Authorization: apiKey
      }
    );

    const rows = payload.transactions ?? payload.filings ?? [];
    const purchaseCount = rows.filter((row) => String(row.transactionCode ?? "").toUpperCase() === "P").length;
    const saleCount = rows.filter((row) => String(row.transactionCode ?? "").toUpperCase() === "S").length;
    const bias =
      purchaseCount + saleCount === 0
        ? "unknown"
        : purchaseCount > saleCount
          ? "risk_on"
          : saleCount > purchaseCount * 1.5
            ? "risk_off"
            : "neutral";

    return {
      reading: {
        totalFilings: payload.total?.value ?? rows.length,
        purchaseCount,
        saleCount,
        bias
      },
      audit: audit("sec_insider", "SEC API Insider Trading", rows.length ? "fetched" : "empty", nowIso())
    };
  } catch (error) {
    return {
      reading: {
        totalFilings: null,
        purchaseCount: null,
        saleCount: null,
        bias: "unknown"
      },
      audit: audit("sec_insider", "SEC API Insider Trading", "failed", nowIso(), String(error))
    };
  }
}

async function fetchUsaSpendingFlow(): Promise<{ reading: PublicFlowReading["federalSpending"]; audit: ProviderAuditItem }> {
  try {
    const payload = await postJson<{
      results?: Array<{
        aggregated_amount?: number;
        fiscal_year?: string | number;
      }>;
    }>("https://api.usaspending.gov/api/v2/search/spending_over_time/", {
      group: "fiscal_year",
      subawards: false,
      filters: {
        keywords: ["federal"],
        time_period: [
          {
            start_date: fiscalYearStart(),
            end_date: compactDate(new Date())
          }
        ],
        award_type_codes: ["A", "B", "C", "D"]
      }
    });

    const obligationTotal =
      payload.results?.reduce((sum, item) => sum + (asNumber(item.aggregated_amount) ?? 0), 0) ?? null;

    return {
      reading: {
        obligationTotal,
        transactionCount: payload.results?.length ?? null,
        bias: obligationTotal === null ? "unknown" : obligationTotal > 0 ? "liquidity_supportive" : "neutral"
      },
      audit: audit("usaspending", "USAspending", obligationTotal === null ? "empty" : "fetched", nowIso())
    };
  } catch (error) {
    return {
      reading: {
        obligationTotal: null,
        transactionCount: null,
        bias: "unknown"
      },
      audit: audit("usaspending", "USAspending", "failed", nowIso(), String(error))
    };
  }
}

async function fetchTreasuryFiscalFlow(): Promise<{ reading: PublicFlowReading["treasuryFiscal"]; audit: ProviderAuditItem }> {
  try {
    const url = new URL("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny");
    url.searchParams.set("fields", "record_date,tot_pub_debt_out_amt");
    url.searchParams.set("sort", "-record_date");
    url.searchParams.set("page[size]", "2");
    const payload = await fetchJson<{ data?: Array<{ record_date?: string; tot_pub_debt_out_amt?: string }> }>(url.toString());
    const latest = asNumber(payload.data?.[0]?.tot_pub_debt_out_amt);
    const previous = asNumber(payload.data?.[1]?.tot_pub_debt_out_amt);
    const direction =
      latest === null || previous === null ? "unknown" : latest > previous ? "rising" : latest < previous ? "falling" : "flat";

    return {
      reading: {
        publicDebt: latest,
        publicDebtPrevious: previous,
        direction,
        bias: direction === "rising" ? "usd_pressure" : direction === "unknown" ? "unknown" : "neutral"
      },
      audit: audit("treasury_fiscal", "Treasury Fiscal Data", latest === null ? "empty" : "fetched", nowIso())
    };
  } catch (error) {
    return {
      reading: {
        publicDebt: null,
        publicDebtPrevious: null,
        direction: "unknown",
        bias: "unknown"
      },
      audit: audit("treasury_fiscal", "Treasury Fiscal Data", "failed", nowIso(), String(error))
    };
  }
}

async function fetchPublicFlow(): Promise<{ publicFlow: PublicFlowReading; audit: ProviderAuditItem[] }> {
  const [secInsider, federalSpending, treasuryFiscal] = await Promise.all([
    fetchSecInsiderFlow(),
    fetchUsaSpendingFlow(),
    fetchTreasuryFiscalFlow()
  ]);
  const publicFlow = {
    generatedAt: nowIso(),
    secInsider: secInsider.reading,
    federalSpending: federalSpending.reading,
    treasuryFiscal: treasuryFiscal.reading,
    summary: ""
  } satisfies PublicFlowReading;

  return {
    publicFlow: {
      ...publicFlow,
      summary: publicFlowSummary(publicFlow)
    },
    audit: [secInsider.audit, federalSpending.audit, treasuryFiscal.audit]
  };
}

async function fetchFredMacro(): Promise<{ macro: MacroReading | null; audit: ProviderAuditItem }> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return { macro: null, audit: audit("fred", "FRED", "not_configured", null) };

  try {
    const latest = await Promise.all(
      Object.entries(FRED_SERIES).map(async ([key, seriesId]) => {
        const url = new URL("https://api.stlouisfed.org/fred/series/observations");
        url.searchParams.set("series_id", seriesId);
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("file_type", "json");
        url.searchParams.set("sort_order", "desc");
        url.searchParams.set("limit", key === "tenYear" ? "5" : "1");
        const payload = await fetchJson<{ observations?: Array<{ value: string }> }>(url.toString());
        const values = (payload.observations ?? []).map((item) => asNumber(item.value)).filter((item): item is number => item !== null);
        return [key, values] as const;
      })
    );

    const map = Object.fromEntries(latest) as Record<keyof typeof FRED_SERIES, number[]>;
    const tenYearLatest = map.tenYear?.[0] ?? null;
    const tenYearPrevious = map.tenYear?.[1] ?? null;
    const tenYearDirection =
      tenYearLatest === null || tenYearPrevious === null
        ? "unknown"
        : tenYearLatest > tenYearPrevious
          ? "rising"
          : tenYearLatest < tenYearPrevious
            ? "falling"
            : "flat";

    const bias = tenYearDirection === "rising" ? "usd_bullish" : tenYearDirection === "falling" ? "usd_bearish" : "neutral";

    return {
      macro: {
        fedFundsRate: map.fedFunds?.[0] ?? null,
        cpiLatest: map.cpi?.[0] ?? null,
        tenYearYield: tenYearLatest,
        tenYearDirection,
        dxyPrice: null,
        dxyDirection: "unknown",
        bias
      },
      audit: audit("fred", "FRED", "fetched", nowIso())
    };
  } catch (error) {
    return { macro: null, audit: audit("fred", "FRED", "failed", nowIso(), String(error)) };
  }
}

async function fetchAlphaDxy(): Promise<{ price: number | null; direction: MacroReading["dxyDirection"]; audit: ProviderAuditItem }> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return { price: null, direction: "unknown", audit: audit("alpha_vantage", "Alpha Vantage", "not_configured", null) };

  try {
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "FX_DAILY");
    url.searchParams.set("from_symbol", "USD");
    url.searchParams.set("to_symbol", "EUR");
    url.searchParams.set("outputsize", "compact");
    url.searchParams.set("apikey", apiKey);
    const payload = await fetchJson<Record<string, unknown>>(url.toString());
    const series = payload["Time Series FX (Daily)"] as Record<string, { "4. close": string }> | undefined;
    const rows = Object.entries(series ?? {})
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 2)
      .map(([, value]) => asNumber(value["4. close"]));
    const latest = rows[0] ?? null;
    const previous = rows[1] ?? null;
    const direction =
      latest === null || previous === null ? "unknown" : latest > previous ? "rising" : latest < previous ? "falling" : "flat";
    return { price: latest, direction, audit: audit("alpha_vantage", "Alpha Vantage", latest ? "fetched" : "empty", nowIso()) };
  } catch (error) {
    return { price: null, direction: "unknown", audit: audit("alpha_vantage", "Alpha Vantage", "failed", nowIso(), String(error)) };
  }
}

async function fetchFinnhubNews(symbols: string[]): Promise<{ news: NewsReading[]; audit: ProviderAuditItem }> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return { news: [], audit: audit("finnhub", "Finnhub", "not_configured", null) };

  try {
    const url = new URL("https://finnhub.io/api/v1/news");
    url.searchParams.set("category", "forex");
    url.searchParams.set("token", apiKey);
    const payload = await fetchJson<Array<{ headline?: string; summary?: string; datetime?: number }>>(url.toString());
    const sixHoursAgo = Math.floor(Date.now() / 1000) - 6 * 60 * 60;
    const recent = payload.filter((item) => !item.datetime || item.datetime >= sixHoursAgo).slice(0, 40);
    const bullishWords = ["rise", "rises", "rally", "bull", "gain", "gains", "higher", "surge", "strong", "beats"];
    const bearishWords = ["fall", "falls", "drop", "bear", "loss", "lower", "weak", "miss", "selloff", "slump"];

    const news = symbols.map((symbol) => {
      const terms = symbolTerms(symbol);
      const matched = recent.filter((item) => {
        const text = `${item.headline ?? ""} ${item.summary ?? ""}`.toLowerCase();
        return terms.some((term) => text.includes(term));
      });
      const scores = matched.map((item) => {
        const text = `${item.headline ?? ""} ${item.summary ?? ""}`.toLowerCase();
        const bullish = bullishWords.some((word) => text.includes(word));
        const bearish = bearishWords.some((word) => text.includes(word));
        return bullish && !bearish ? "bullish" : bearish && !bullish ? "bearish" : "neutral";
      });
      const bullish = scores.filter((score) => score === "bullish").length;
      const bearish = scores.filter((score) => score === "bearish").length;
      const neutral = scores.filter((score) => score === "neutral").length;
      const tone = matched.length === 0 ? "unknown" : bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral";
      return {
        symbol,
        bullish,
        bearish,
        neutral,
        tone,
        headlines: matched.map((item) => item.headline ?? "").filter(Boolean).slice(0, 5)
      } satisfies NewsReading;
    });

    return { news, audit: audit("finnhub", "Finnhub", "fetched", nowIso()) };
  } catch (error) {
    return { news: [], audit: audit("finnhub", "Finnhub", "failed", nowIso(), String(error)) };
  }
}

async function fetchFinnhubEconomicCalendar(): Promise<{ events: EconomicEvent[]; audit: ProviderAuditItem }> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return { events: [], audit: audit("finnhub_calendar", "Finnhub Economic Calendar", "not_configured", null) };

  try {
    const now = new Date();
    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const url = new URL("https://finnhub.io/api/v1/calendar/economic");
    url.searchParams.set("from", compactDate(now));
    url.searchParams.set("to", compactDate(end));
    url.searchParams.set("token", apiKey);
    const payload = await fetchJson<{
      economicCalendar?: Array<{
        country?: string;
        event?: string;
        impact?: string | number;
        time?: string;
        unit?: string;
        actual?: string | number | null;
        estimate?: string | number | null;
        prev?: string | number | null;
      }>;
    }>(url.toString());

    const events = (payload.economicCalendar ?? [])
      .map((item, index) => {
        const startsAt = item.time ? new Date(item.time) : null;
        if (!startsAt || Number.isNaN(startsAt.getTime())) return null;
        if (startsAt.getTime() < now.getTime() || startsAt.getTime() > end.getTime()) return null;

        const title = item.event?.trim();
        if (!title) return null;

        return {
          id: `finnhub_${startsAt.getTime()}_${index}`,
          title,
          currency: currencyFromCountry(item.country),
          impact: normalizeImpact(item.impact),
          startsAt: startsAt.toISOString(),
          source: "provider" as const,
          notes: [item.actual !== null && item.actual !== undefined ? `actual ${item.actual}` : null, item.estimate ? `estimate ${item.estimate}` : null]
            .filter(Boolean)
            .join(", ")
        } satisfies EconomicEvent;
      })
      .filter(Boolean) as EconomicEvent[];

    return {
      events,
      audit: audit("finnhub_calendar", "Finnhub Economic Calendar", events.length ? "fetched" : "empty", nowIso())
    };
  } catch (error) {
    return {
      events: [],
      audit: audit("finnhub_calendar", "Finnhub Economic Calendar", "failed", nowIso(), String(error))
    };
  }
}

function readXmlTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "i"));
  return match?.[1] ?? null;
}

function makeSentimentReading(input: {
  symbol: string;
  longPercentage: number | null;
  shortPercentage: number | null;
  longVolume: number | null;
  shortVolume: number | null;
}): SentimentReading {
  const bias =
    input.longPercentage === null || input.shortPercentage === null
      ? "unknown"
      : input.longPercentage >= 55
        ? "retail_long"
        : input.shortPercentage >= 55
          ? "retail_short"
          : "balanced";
  const contrarianBias = bias === "retail_long" ? "short" : bias === "retail_short" ? "long" : "neutral";

  return {
    ...input,
    bias,
    contrarianBias
  };
}

async function fetchMyfxbookPublicSentiment(symbols: string[]): Promise<SentimentReading[]> {
  const html = await fetchText("https://www.myfxbook.com/community/outlook");
  const text = html.replace(/\s+/g, " ");

  return symbols
    .map((symbol) => {
      const pattern = new RegExp(
        `${symbol}\\s+Short\\s+(\\d+(?:\\.\\d+)?)%\\s+([\\d,.]+)\\s+lots\\s+\\d+\\s+Long\\s+(\\d+(?:\\.\\d+)?)%\\s+([\\d,.]+)\\s+lots`,
        "i"
      );
      const match = text.match(pattern);
      if (!match) return null;

      return makeSentimentReading({
        symbol,
        shortPercentage: asNumber(match[1]),
        shortVolume: asNumber(match[2]),
        longPercentage: asNumber(match[3]),
        longVolume: asNumber(match[4])
      });
    })
    .filter((item): item is SentimentReading => Boolean(item));
}

async function fetchMyfxbookSentiment(symbols: string[]): Promise<{ sentiment: SentimentReading[]; audit: ProviderAuditItem }> {
  const email = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  if (!email || !password) return { sentiment: [], audit: audit("myfxbook", "Myfxbook", "not_configured", null) };

  try {
    const loginUrl = new URL("https://www.myfxbook.com/api/login.xml");
    loginUrl.searchParams.set("email", email);
    loginUrl.searchParams.set("password", password);
    const loginXml = await fetchText(loginUrl.toString());
    const session = readXmlTag(loginXml, "session");
    if (!session) throw new Error("Myfxbook login did not return a session");

    const outlookUrl = new URL("https://www.myfxbook.com/api/get-community-outlook.xml");
    outlookUrl.searchParams.set("session", session);
    const outlookXml = await fetchText(outlookUrl.toString());
    const symbolBlocks = [...outlookXml.matchAll(/<symbol>([\s\S]*?)<\/symbol>/gi)].map((match) => match[1]);
    const sentiment = symbolBlocks
      .map((block) => {
        return makeSentimentReading({
          symbol: readXmlTag(block, "name") ?? "",
          longPercentage: asNumber(readXmlTag(block, "longPercentage")),
          shortPercentage: asNumber(readXmlTag(block, "shortPercentage")),
          longVolume: asNumber(readXmlTag(block, "longVolume")),
          shortVolume: asNumber(readXmlTag(block, "shortVolume"))
        });
      })
      .filter((item) => symbols.includes(item.symbol));

    return { sentiment, audit: audit("myfxbook", "Myfxbook", sentiment.length ? "fetched" : "empty", nowIso()) };
  } catch (error) {
    try {
      const sentiment = await fetchMyfxbookPublicSentiment(symbols);
      if (sentiment.length) {
        return {
          sentiment,
          audit: audit("myfxbook", "Myfxbook", "fetched", nowIso(), `XML API failed; public sentiment fallback used. ${String(error)}`)
        };
      }
    } catch {
      // Preserve the original XML/API failure below because that is the actionable credential issue.
    }

    return { sentiment: [], audit: audit("myfxbook", "Myfxbook", "failed", nowIso(), String(error)) };
  }
}

export async function getExternalMarketContext(symbols = DEFAULT_SYMBOLS): Promise<ExternalMarketContext> {
  const [fred, alpha, finnhub, calendar, myfxbook, binance, kraken, hyperliquid, fearGreed, publicFlow] = await Promise.all([
    fetchFredMacro(),
    fetchAlphaDxy(),
    fetchFinnhubNews(symbols),
    fetchFinnhubEconomicCalendar(),
    fetchMyfxbookSentiment(symbols),
    fetchBinanceCryptoDepth(),
    fetchKrakenCryptoDepth(),
    fetchHyperliquidCryptoDepth(),
    fetchAlternativeFearGreed(),
    fetchPublicFlow()
  ]);

  const macro = fred.macro
    ? {
        ...fred.macro,
        dxyPrice: alpha.price,
        dxyDirection: alpha.direction,
        bias:
          alpha.direction === "rising"
            ? "usd_bullish"
            : alpha.direction === "falling"
              ? "usd_bearish"
              : fred.macro.bias
      }
    : null;

  return {
    generatedAt: nowIso(),
    audit: [
      fred.audit,
      alpha.audit,
      finnhub.audit,
      calendar.audit,
      myfxbook.audit,
      binance.audit,
      kraken.audit,
      hyperliquid.audit,
      fearGreed.audit,
      ...publicFlow.audit
    ],
    economicEvents: calendar.events,
    sentiment: myfxbook.sentiment,
    macro,
    news: finnhub.news,
    cryptoDepth: [...binance.cryptoDepth, ...kraken.cryptoDepth, ...hyperliquid.cryptoDepth],
    fearGreed: fearGreed.fearGreed,
    publicFlow: publicFlow.publicFlow
  };
}
