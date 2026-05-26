export const connectors = [
  {
    name: "Vantage MT5",
    description: "Forex and XAUUSD through a Windows VPS bridge.",
    status: "First build",
    tone: "green"
  },
  {
    name: "Binance",
    description: "Spot or futures crypto connector for BTC and majors.",
    status: "Queued",
    tone: "amber"
  },
  {
    name: "Hyperliquid",
    description: "Wallet-signed perp execution for on-chain markets.",
    status: "Planned",
    tone: "blue"
  }
];

export const riskRules = [
  { label: "Max risk per trade", value: "0.50%" },
  { label: "Max daily loss", value: "3.00%" },
  { label: "Stop loss required", value: "Yes" },
  { label: "Max open trades", value: "5" },
  { label: "Allowed MT5 symbols", value: "XAUUSD, EURUSD, GBPUSD" },
  { label: "Public beta access", value: "Invite only" }
];

export const trades = [
  { route: "MT5", symbol: "XAUUSD", side: "Long", size: "0.20 lot", status: "Open", pnl: 284 },
  { route: "MT5", symbol: "EURUSD", side: "Short", size: "0.15 lot", status: "Closed", pnl: 96 },
  { route: "Binance", symbol: "BTCUSDT", side: "Long", size: "0.04 BTC", status: "Closed", pnl: -72 },
  { route: "MT5", symbol: "GBPUSD", side: "Long", size: "0.10 lot", status: "Open", pnl: 44 }
];
