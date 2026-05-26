# AlphaPilot Live Scanner Strategy

AlphaPilot uses strategy rules as the driver, AI analysis as the analyst layer, and risk controls as the final gate.

## Data Sources

Every production scan should try to fetch fresh data from:

- Vantage MT5: live bid/ask, account telemetry, positions.
- Myfxbook Community Outlook: retail long/short positioning.
- Forex Factory Calendar: high-impact events and news blackout windows.
- Market structure/OHLCV provider: 1D, 4H, 1H, 30M, 15M, 1M trend, ATR, EMA stack, volume.
- DXY feed: dollar index price, direction and trend bias.
- Coinglass: crypto OI, funding and liquidation context.
- FRED: US rates, CPI and 10Y yield context.
- NewsAPI.ai: recent financial headlines and sentiment.
- Fear & Greed provider: risk-on/risk-off context.
- SEC API insider trading: broad-market US equity insider activity as a risk appetite overlay.
- USAspending: federal award/spending flow as macro liquidity context.
- Treasury Fiscal Data: public debt/fiscal pressure context for USD and rates-sensitive assets.

The frontend should not show source references. The backend should keep a source audit for debugging, compliance and scan quality.

## Sessions

- Asia, 00:00-07:00 UTC: low liquidity, range bias.
- London, 07:00-12:00 UTC: high liquidity, breakout bias.
- London/NY, 12:00-17:00 UTC: highest liquidity, trend continuation.
- NY Afternoon, 17:00-21:00 UTC: fading volume, avoid new positions.
- Dead Zone, 21:00-00:00 UTC: no setup generation.

## Layers

1. Macro bias: DXY, FRED rates/CPI/10Y, Fear & Greed.
2. Structure: 1D and 4H trend, key levels, EMA stack, ATR and volume.
3. Sentiment confluence: Myfxbook retail positioning plus news tone.
4. Risk clearance: Forex Factory high-impact calendar and blackout window.
5. Crypto depth: Coinglass OI, funding and liquidation levels for crypto only.
6. Public flow overlay: SEC insider activity, USAspending obligations, and Treasury fiscal pressure. This layer informs confidence and narrative only; it should not override hard risk gates.

## Hard Rules

- News blackout within 45 minutes means no setup.
- Dead Zone means no setup.
- Signal score below 7 means no setup.
- If three or more external sources fail, abort the scan and retry later.
- Never generate a setup from assumed or stale data.
