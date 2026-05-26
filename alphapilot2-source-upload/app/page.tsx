"use client";

import {
  BarChart3,
  Bell,
  Bot,
  Brain,
  Calendar,
  Check,
  ChevronRight,
  CircleHelp,
  Cpu,
  Database,
  Download,
  Filter,
  Globe2,
  LayoutDashboard,
  Lock,
  Menu,
  Play,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Wallet,
  Zap
} from "lucide-react";
import { useMemo, useState } from "react";

const navItems = [
  { id: "command", label: "Command Center", icon: LayoutDashboard },
  { id: "brokers", label: "Brokers", icon: User },
  { id: "strategies", label: "Strategies", icon: Cpu },
  { id: "ai", label: "AI Intelligence", icon: Brain },
  { id: "risk", label: "Risk Engine", icon: Shield },
  { id: "portfolio", label: "Portfolio", icon: Wallet },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "trade-log", label: "Trade Log", icon: Database },
  { id: "automation", label: "Automation", icon: Settings },
  { id: "settings", label: "Settings", icon: Settings }
];

const aiTabs = ["Overview", "Market Analysis", "Sentiment", "Macro Outlook", "Opportunities", "News Feed", "Reports"];

const markets = [
  { symbol: "BTC / USDT", value: "63,241.23", change: "+2.34%", tone: "good", volume: "$28.41B" },
  { symbol: "ETH / USDT", value: "3,142.18", change: "+1.81%", tone: "good", volume: "$15.67B" },
  { symbol: "S&P 500", value: "5,325.84", change: "+0.72%", tone: "good", volume: "$2.13B" },
  { symbol: "Gold", value: "2,354.71", change: "-0.21%", tone: "bad", volume: "$1.32B" },
  { symbol: "VIX", value: "15.82", change: "-2.45%", tone: "bad", volume: "N/A" }
];

const brokers = [
  ["Vantage", "Forex, Indices, Commodities", "$78,642.21", "$12,543.21", "+1.59%", "18ms"],
  ["BloFin", "Crypto Futures, Spot", "$45,231.87", "$8,231.87", "+1.67%", "21ms"],
  ["Hyperliquid", "Perpetuals", "$32,688.42", "$6,688.42", "+1.23%", "16ms"],
  ["Bybit", "Crypto Futures, Options", "$56,981.24", "$9,781.24", "+1.65%", "31ms"],
  ["MetaTrader 5", "Forex, Indices, Commodities", "$28,732.15", "$4,732.15", "-0.43%", "42ms"],
  ["Interactive Brokers", "Stocks, ETFs, Options", "$12,066.29", "$1,866.29", "-0.63%", "25ms"]
];

const opportunities = [
  ["BTC", "Breakout Continuation", "LONG", "92", "72%", "2.8 : 1", "Bull Flag Breakout", "4H"],
  ["ETH", "Trend Continuation", "LONG", "86", "68%", "2.3 : 1", "EMA Bounce", "4H"],
  ["XAU", "Pullback Bounce", "LONG", "79", "64%", "2.1 : 1", "Support Zone Hold", "1D"],
  ["EUR/USD", "Trend Continuation", "LONG", "74", "61%", "1.9 : 1", "Trendline Break", "1D"],
  ["GBP/USD", "Range Breakout", "SHORT", "71", "60%", "2.0 : 1", "Resistance Rejection", "4H"]
];

const reports = [
  ["Bitcoin (BTC) Weekly Outlook", "BTC shows strong momentum above key support. ETF inflows and on-chain data suggest accumulation continues.", "Bullish", "78%", "Market Outlook"],
  ["Ethereum Technical & On-Chain Analysis", "ETH consolidates after the Pectra upgrade. Staking inflows remain steady while exchange balances hit lows.", "Neutral", "64%", "Asset Analysis"],
  ["Gold (XAU) Market Outlook", "Gold prices are supported by geopolitical risks and rate-cut expectations near all-time highs.", "Bullish", "72%", "Commodities"],
  ["EUR/USD Macro & Technical Outlook", "EUR/USD shows signs of stabilization as ECB and Fed divergence narrows.", "Neutral", "61%", "Forex"]
];

const news = [
  ["Fed Holds Rates Steady, Signals Higher for Longer on Persistent Inflation", "Central Banks", "High Impact", "EUR/USD -0.42%", "2m ago"],
  ["Gold Rallies Above $2,350 as Geopolitical Tensions Escalate", "Commodities", "Medium Impact", "XAU +1.25%", "25m ago"],
  ["ECB's Lagarde: Rates Likely to Remain Restrictive Until Inflation Returns", "Eurozone", "Medium Impact", "EUR/USD -0.18%", "1h ago"],
  ["US CPI Data Comes In Cooler Than Expected", "Economy", "Low Impact", "BTC +1.12%", "2h ago"],
  ["Oil Prices Rise on Supply Concerns After OPEC+ Output Decision", "Energy", "Medium Impact", "XAU +0.22%", "3h ago"]
];

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark" />
      <div className="brand-word">
        alpha<span>Pilot</span>
      </div>
    </div>
  );
}

function Topbar({ compact = false }: { compact?: boolean }) {
  return (
    <header className="topbar">
      {compact ? (
        <button className="icon-button" aria-label="Menu">
          <Menu size={18} />
        </button>
      ) : null}
      <div className="system-pill">
        <span />
        <div>
          <small>System Status</small>
          <strong>All Systems Operational</strong>
        </div>
      </div>
      <div className="top-actions">
        <Search size={20} />
        <div className="notification">
          <Bell size={20} />
          <span>3</span>
        </div>
        <CircleHelp size={20} />
        <div className="profile">
          <User size={18} />
          <div>
            <strong>Alpha Trader</strong>
            <small>Pro Plan</small>
          </div>
          <div className="avatar">AT</div>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <aside className="sidebar">
      <Logo />
      <nav>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={active === item.id ? "nav-item active" : "nav-item"} onClick={() => onChange(item.id)}>
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="side-card mode-card">
        <small>Automation Mode</small>
        <strong>
          <Zap size={18} /> Autopilot Mode <span />
        </strong>
        <p>Fully automated trading</p>
        <button>Manage Modes</button>
      </div>
      <div className="side-card upgrade-card">
        <Sparkles size={20} />
        <p>Unlock the full power of AI Intelligence</p>
        <button>Upgrade Now</button>
      </div>
      <div className="side-card status-card">
        <span />
        <p>System Status</p>
        <strong>All Systems Operational</strong>
      </div>
    </aside>
  );
}

function Sparkline({ tone = "good" }: { tone?: "good" | "bad" | "warn" }) {
  const points = tone === "bad" ? "0,18 16,20 32,14 48,19 64,12 80,16 96,11 112,18 128,13 144,15 160,10" : "0,30 16,25 32,28 48,20 64,24 80,19 96,21 112,13 128,16 144,8 160,10";
  return (
    <svg className={`spark ${tone}`} viewBox="0 0 160 42" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

function MetricCard({ label, value, sub, tone = "good" }: { label: string; value: string; sub: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span className={tone}>{sub}</span>
      <Sparkline tone={tone} />
    </div>
  );
}

function Ring({ value, label, tone = "good" }: { value: string; label: string; tone?: "good" | "warn" }) {
  return (
    <div className={`ring ${tone}`}>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function CommandCenter() {
  return (
    <Screen title="Command Center" subtitle="Real-time overview of your automated trading system">
      <div className="metric-grid five">
        <MetricCard label="Total Equity" value="$124,842.21" sub="+24.82%" />
        <MetricCard label="Daily P&L" value="$2,341.66" sub="+1.92%" />
        <div className="metric-card split">
          <p>Open Positions</p>
          <strong>14</strong>
          <span>Across 6 Markets</span>
          <Ring value="54%" label="Exposure" />
        </div>
        <MetricCard label="Win Rate" value="67.31%" sub="Last 100 Trades" />
        <MetricCard label="System Uptime" value="99.97%" sub="24/7 Monitoring" />
      </div>
      <div className="dashboard-grid">
        <Panel title="Equity Curve" action="30 Days">
          <div className="large-chart">
            <Sparkline />
            <div className="tooltip-card">
              <strong>May 9, 2025</strong>
              <span>Equity $124,842.21</span>
              <span>Benchmark $102,431.07</span>
            </div>
          </div>
        </Panel>
        <Panel title="Connected Brokers">
          <div className="broker-mini-list">
            {brokers.slice(0, 5).map((broker) => (
              <div key={broker[0]}>
                <span className="coin">{broker[0][0]}</span>
                <strong>{broker[0]}</strong>
                <small>{broker[1]}</small>
                <em>Connected</em>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Market Regime">
          <div className="bull-visual">
            <Globe2 size={118} />
            <strong>Trending Bullish</strong>
            <span>Confidence 78%</span>
          </div>
        </Panel>
        <Panel title="Active Strategies">
          <Rows rows={["AI Trend Following", "Multi-Asset Momentum", "Mean Reversion AI", "Volatility Breakout", "News Sentiment Scalper"]} />
        </Panel>
        <Panel title="Risk Overview">
          <div className="risk-grid">
            <Ring value="32" label="Low Risk" />
            <p>Drawdown 24/100</p>
            <p>Exposure 41/100</p>
            <p>Liquidity 30/100</p>
            <p>Correlation 28/100</p>
          </div>
        </Panel>
        <Panel title="System Health">
          <Rows rows={["Market Data Feeds", "Order Execution", "Risk Engine", "AI Models", "Broker Connections", "Strategy Engine"]} check />
        </Panel>
      </div>
    </Screen>
  );
}

function Brokers() {
  return (
    <Screen title="Brokers" subtitle="Connect and manage your execution infrastructure" action={<button className="primary"><Plus size={16} /> Connect New Broker</button>}>
      <div className="metric-grid five">
        <MetricCard label="Connected Brokers" value="6 / 8" sub="Active Connections" />
        <MetricCard label="Total Account Value" value="$256,342.18" sub="Across all brokers" />
        <MetricCard label="Total Cash Balance" value="$42,785.63" sub="Available to deploy" />
        <MetricCard label="Total Open P&L" value="$3,214.56" sub="+1.28% today" />
        <div className="metric-card center"><Ring value="28ms" label="Excellent" /></div>
      </div>
      <div className="two-column">
        <Panel title="Broker Connections" className="wide">
          <table className="table">
            <thead>
              <tr><th>Broker</th><th>Status</th><th>Latency</th><th>Account Value</th><th>Cash</th><th>Open P&L</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {brokers.map((broker) => (
                <tr key={broker[0]}>
                  <td><strong>{broker[0]}</strong><small>{broker[1]}</small></td>
                  <td><span className="dot-status">Connected</span></td>
                  <td>{broker[5]}<small>Excellent</small></td>
                  <td>{broker[2]}</td>
                  <td>{broker[3]}</td>
                  <td className={broker[4].startsWith("+") ? "good" : "bad"}>{broker[4]}</td>
                  <td><button className="ghost">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="stack">
          <Panel title="Connection Overview"><div className="map-visual"><Globe2 size={180} /></div></Panel>
          <Panel title="API Security"><div className="security"><Shield size={62} /><p>All connections use read-only permissions where possible.</p></div></Panel>
          <Panel title="Recent Activity"><Rows rows={["Vantage synced", "BloFin synced", "Hyperliquid order executed", "Bybit position closed"]} /></Panel>
        </div>
      </div>
    </Screen>
  );
}

function Strategies() {
  return (
    <Screen title="Strategy Builder" subtitle="Design, backtest, and optimize your trading strategies" action={<button className="primary">Deploy</button>}>
      <div className="builder-layout">
        <Panel title="Blocks" className="toolbox">
          <Rows rows={["Indicator", "Price Action", "Volume", "Time", "AI Condition", "Buy / Long", "Sell / Short", "Close Position"]} />
        </Panel>
        <div className="stack">
          <Panel title="Strategy Logic Builder" action="+ Add Block">
            <div className="flow">
              {["START", "RSI", "AND", "Bollinger Bands", "AND", "Volume", "THEN", "Buy Long", "Exit"].map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="drop-zone">Drag blocks here to build your strategy</div>
          </Panel>
          <Panel title="Backtest Results" action="Download Report">
            <div className="stat-strip">
              {["+68.24%", "42.78%", "1.82", "2.34", "-12.41%", "63.71%", "328"].map((item) => <strong key={item}>{item}</strong>)}
            </div>
            <div className="large-chart"><Sparkline /></div>
          </Panel>
          <Panel title="Recent Trades">
            <table className="table compact">
              <tbody>
                {["BTCUSDT Long +2.36%", "ETHUSDT Long -1.01%", "SOLUSDT Short +1.82%", "LINKUSDT Long +1.45%"].map((trade) => <tr key={trade}><td>{trade}</td><td>Closed</td></tr>)}
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Strategy Parameters"><Rows rows={["Risk per Trade 1%", "Max Open Positions 5", "Timeframe 1H", "Market Crypto", "Allow Short On"]} /></Panel>
          <Panel title="AI Optimization"><button className="primary full"><Bot size={16} /> Optimize Strategy</button></Panel>
          <Panel title="Strategy Health"><Ring value="87" label="Very Good" /></Panel>
        </div>
      </div>
    </Screen>
  );
}

function AIIntelligence() {
  const [tab, setTab] = useState("Overview");
  return (
    <Screen title="AI Intelligence" subtitle={tab === "Overview" ? "Real-time market intelligence powered by advanced AI models" : `AI-powered ${tab.toLowerCase()} workspace`}>
      <div className="ai-top">
        <div className="engine-pill"><span /> AI Engine <strong>Active</strong><small>Model: Titan 2.1</small></div>
        <div className="date-filter"><Calendar size={16} /> May 9, 2025 <Filter size={16} /> Filters</div>
      </div>
      <div className="tabs">
        {aiTabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "active" : ""}>{item}</button>)}
      </div>
      {tab === "Overview" && <AIOverview />}
      {tab === "Market Analysis" && <MarketAnalysis />}
      {tab === "Sentiment" && <Sentiment />}
      {tab === "Macro Outlook" && <Macro />}
      {tab === "Opportunities" && <Opportunities />}
      {tab === "News Feed" && <NewsFeed />}
      {tab === "Reports" && <Reports />}
    </Screen>
  );
}

function AIOverview() {
  return (
    <div className="ai-layout">
      <div className="stack">
        <Panel title="Market Overview" action="24H">
          <div className="market-cards">
            {markets.map((market) => <MarketCard key={market.symbol} {...market} />)}
          </div>
        </Panel>
        <div className="two-grid">
          <Panel title="AI Insights"><Rows rows={["Bitcoin breakout probability increasing", "ETH accumulation phase", "Altseason index rising", "Caution: CPI volatility ahead"]} /></Panel>
          <Panel title="AI Market Heatmap"><Heatmap /></Panel>
        </div>
        <div className="two-grid">
          <Panel title="AI Model Status"><Rows rows={["Titan 2.1 Primary", "Sentiment Analyzer v3", "Macro Predictor v2", "Risk Assessor v1.9"]} check /></Panel>
          <Panel title="Data Sources"><Rows rows={["On-Chain Data Streaming", "Social Sentiment Streaming", "News & Media Streaming", "Market Data Streaming"]} check /></Panel>
        </div>
      </div>
      <div className="stack">
        <Panel title="AI Briefing"><h3>Bullish bias across risk assets with caution ahead of CPI data.</h3><p>AI models detect strong momentum in crypto markets driven by ETF inflows and improving liquidity.</p><button className="ghost full">View Full Report</button></Panel>
        <Panel title="Market Sentiment"><Ring value="68%" label="Bullish" /></Panel>
        <Panel title="Economic Calendar"><Rows rows={["US CPI High", "US Core CPI High", "US Retail Sales Medium", "US Michigan Sentiment Low"]} /></Panel>
        <Panel title="Market Regime"><div className="regime">Risk-On <Sparkline /></div></Panel>
      </div>
    </div>
  );
}

function MarketAnalysis() {
  return (
    <div className="stack">
      <div className="market-cards">{markets.slice(0, 5).map((market) => <MarketCard key={market.symbol} {...market} />)}</div>
      <div className="two-column">
        <Panel title="Price Performance (24H)" className="wide"><div className="large-chart"><Sparkline /></div></Panel>
        <Panel title="Key Support & Resistance Levels"><Rows rows={["BTC / USD Bullish", "ETH / USD Bullish", "XAU / USD Bearish", "EUR / USD Bullish", "GBP / USD Bullish"]} /></Panel>
      </div>
      <div className="three-grid">
        <Panel title="Technical Indicators"><Rows rows={["BTC RSI 62.34 Bullish", "ETH MACD 82.45 Bullish", "XAU RSI 44.22 Bearish", "EUR Moving Avg Bullish"]} /></Panel>
        <Panel title="Economic Events Impact"><Rows rows={["US CPI High", "US PPI High", "ECB Rate Decision High", "UK CPI Medium"]} /></Panel>
        <Panel title="AI Insight"><Brain size={60} /><p>BTC showing strong bullish momentum with high volume breakout.</p></Panel>
      </div>
    </div>
  );
}

function Sentiment() {
  return (
    <div className="stack">
      <div className="market-cards">{markets.map((market, index) => <MarketCard key={market.symbol} {...market} value={["72", "58", "48", "61", "58"][index]} change={["Strong Positive", "Positive", "Neutral", "Positive", "Slightly Positive"][index]} />)}</div>
      <div className="three-grid">
        <Panel title="Sentiment Over Time" className="wide"><div className="large-chart multi"><Sparkline /><Sparkline tone="warn" /><Sparkline tone="bad" /></div></Panel>
        <Panel title="Sentiment Breakdown"><Rows rows={["News 65% Bullish", "Social Media 72% Bullish", "Forums 61% Bullish", "On-Chain Data 74% Bullish"]} /></Panel>
        <Panel title="Overall Market Sentiment"><Ring value="63" label="Positive" tone="warn" /></Panel>
      </div>
      <div className="two-grid">
        <Panel title="Social Sentiment Heatmap"><Heatmap compact /></Panel>
        <Panel title="Fear & Greed Index"><Ring value="72" label="Greed" tone="warn" /></Panel>
      </div>
    </div>
  );
}

function Macro() {
  return (
    <div className="stack">
      <div className="three-grid">
        <Panel title="Global Growth Outlook" className="wide"><div className="map-visual"><Globe2 size={260} /><p>Global growth remains resilient but divergent.</p></div></Panel>
        <Panel title="Key Macro Themes"><Rows rows={["Disinflation Progress Positive", "Monetary Policy Divergence Neutral", "Fiscal Expansion Positive", "Geopolitical Risk Negative", "Commodity Cycle Neutral"]} /></Panel>
        <Panel title="Macro Health Score"><Ring value="62" label="Moderately Positive" tone="warn" /></Panel>
      </div>
      <div className="three-grid">
        <Panel title="Economic Indicators"><Rows rows={["GDP Growth Positive", "Inflation Neutral", "Unemployment Neutral", "Retail Sales Negative"]} /></Panel>
        <Panel title="Central Bank Watch"><Rows rows={["Federal Reserve Neutral", "ECB Dovish", "Bank of England Neutral", "Bank of Japan Neutral"]} /></Panel>
        <Panel title="Macro Forecasts"><Rows rows={["Global GDP 3.1%", "US GDP 1.9%", "EUR GDP 1.1%", "Gold Avg $2,400"]} /></Panel>
      </div>
    </div>
  );
}

function Opportunities() {
  return (
    <div className="opportunity-layout">
      <div className="metric-grid six">
        <MetricCard label="Total Opportunities" value="24" sub="+6 vs yesterday" />
        <MetricCard label="High Conviction" value="8" sub="33% of total" />
        <MetricCard label="Avg. Win Probability" value="68%" sub="+5%" />
        <MetricCard label="Avg. Risk / Reward" value="2.4 : 1" sub="Excellent" />
        <MetricCard label="Total Expected Edge" value="+12.6%" sub="Portfolio Edge" />
        <Panel title="Opportunity Heatmap"><Heatmap mini /></Panel>
      </div>
      <div className="two-column">
        <Panel title="All Assets" className="wide">
          <table className="table">
            <tbody>
              {opportunities.map((item) => <tr key={item[0]}><td><strong>{item[0]}</strong><small>{item[1]}</small></td><td><span className={item[2] === "SHORT" ? "badge bad" : "badge"}>{item[2]}</span></td><td><Ring value={item[3]} label="AI" /></td><td>{item[4]}</td><td className="good">{item[5]}</td><td>{item[6]}</td><td>{item[7]}</td><td><button className="ghost">View Setup</button></td></tr>)}
            </tbody>
          </table>
        </Panel>
        <div className="stack">
          <Panel title="Top Opportunity"><h2>BTC / USD</h2><div className="stat-strip"><strong>92</strong><strong>72%</strong><strong>2.8 : 1</strong></div><Sparkline /><button className="ghost full">View Full Setup</button></Panel>
          <Panel title="Allocation Suggestion"><Ring value="100%" label="Suggested" /></Panel>
        </div>
      </div>
    </div>
  );
}

function NewsFeed() {
  return (
    <div className="two-column">
      <Panel title="News Feed" className="wide" action="Market Impact">
        <div className="news-list">
          {news.map((item) => <article key={item[0]}><time>{item[4]}</time><span className="badge warn">{item[2]}</span><div><h3>{item[0]}</h3><p>{item[1]}</p></div><strong>{item[3]}</strong></article>)}
        </div>
      </Panel>
      <div className="stack">
        <Panel title="Market Impact Overview"><div className="stat-strip"><strong>6</strong><strong>12</strong><strong>18</strong><strong>36</strong></div></Panel>
        <Panel title="News Sentiment"><Ring value="0.28" label="Slightly Positive" tone="warn" /></Panel>
        <Panel title="Top Trending Topics"><Rows rows={["Inflation & Rates", "Central Banks", "Geopolitics", "Commodities", "US Economy"]} /></Panel>
      </div>
    </div>
  );
}

function Reports() {
  return (
    <div className="two-column">
      <Panel title="Research Reports" className="wide" action="Newest">
        <div className="report-list">
          {reports.map((item) => <article key={item[0]}><div className="report-art"><Sparkles size={48} /></div><div><small>{item[4]}</small><h3>{item[0]}</h3><p>{item[1]}</p><em>May 9, 2025 - AI Generated</em></div><div><span>{item[2]}</span><strong>{item[3]}</strong><button className="ghost">View Report</button></div></article>)}
        </div>
      </Panel>
      <div className="stack">
        <Panel title="Featured Reports"><Rows rows={["Q2 2025 Global Market Outlook", "Impact of Rate Cuts on Risk Assets", "Gold: Safe Haven or Growth Play?", "Crypto Market Structure Report"]} /></Panel>
        <Panel title="Custom AI Reports"><button className="primary full"><Sparkles size={16} /> Generate Report</button></Panel>
        <Panel title="Reports Center"><Rows rows={["Saved Reports 24", "Downloaded Reports 18"]} /></Panel>
      </div>
    </div>
  );
}

function Onboarding() {
  return (
    <Screen title="Create your alphaPilot account" subtitle="Join a new standard in automated trading. Intelligent. Secure. Built for performance.">
      <div className="onboarding">
        <div className="signup-panel">
          <Logo />
          <span className="badge">Step 1 of 3</span>
          <h1>Create your alpha<span>Pilot</span> account</h1>
          <label>Email Address<input placeholder="you@domain.com" /></label>
          <div className="field-grid"><label>Password<input placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" /></label><label>Confirm Password<input placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" /></label></div>
          <label>Referral Code (Optional)<input placeholder="Enter referral code" /></label>
          <button className="primary full">Continue <ChevronRight size={18} /></button>
        </div>
        <div className="hero-visual">
          <div className="logo-orbit" />
          <div className="feature-row">
            {["AI-Powered Automation", "Institutional Risk Management", "Real-Time Intelligence", "Secure & Private"].map((item) => <div key={item}><Brain size={34} /><strong>{item}</strong></div>)}
          </div>
        </div>
      </div>
    </Screen>
  );
}

function Landing() {
  return (
    <div className="landing">
      <header><Logo /><nav><span>Product</span><span>Features</span><span>How It Works</span><span>Pricing</span></nav><button className="primary">Get Started</button></header>
      <section className="landing-hero">
        <div><span className="badge">AI-powered automated trading system</span><h1>Intelligent Trading. <span>Automated</span> Success.</h1><p>alphaPilot AI connects to your broker and trades the markets for you using advanced algorithms, real-time intelligence, and institutional-grade risk management.</p><button className="primary">Start Free Trial</button><button className="ghost">See How It Works <Play size={14} /></button></div>
        <div className="coin-stage"><div>â‚¿</div><div>Îž</div><div>Au</div></div>
      </section>
      <section className="feature-band">
        {["AI Market Intelligence", "Automated Execution", "Risk Management", "Performance Analytics", "Secure & Reliable"].map((item) => <div key={item}><Zap size={34} /><strong>{item}</strong><p>Advanced analytics and controls built for every edge.</p></div>)}
      </section>
    </div>
  );
}

function Screen({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="content">
      <div className="page-title">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        {action}
      </div>
      {children}
    </main>
  );
}

function Panel({ title, action, className = "", children }: { title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head"><h2>{title}</h2>{action ? <span>{action}</span> : null}</div>
      {children}
    </section>
  );
}

function Rows({ rows, check = false }: { rows: string[]; check?: boolean }) {
  return <div className="rows">{rows.map((row) => <div key={row}>{check ? <Check size={16} /> : <span className="row-dot" />}<p>{row}</p><em>{check ? "Operational" : "View"}</em></div>)}</div>;
}

function MarketCard({ symbol, value, change, tone, volume }: { symbol: string; value: string; change: string; tone: string; volume?: string }) {
  return (
    <div className="market-card">
      <p>{symbol}</p>
      <strong>{value}</strong>
      <span className={tone}>{change}</span>
      <Sparkline tone={tone === "bad" ? "bad" : "good"} />
      {volume ? <small>24h Vol: {volume}</small> : null}
    </div>
  );
}

function Heatmap({ compact = false, mini = false }: { compact?: boolean; mini?: boolean }) {
  const cells = useMemo(() => Array.from({ length: mini ? 36 : compact ? 25 : 14 }, (_, i) => i), [compact, mini]);
  return <div className={`heatmap ${compact ? "compact" : ""} ${mini ? "mini" : ""}`}>{cells.map((cell) => <span key={cell} className={cell % 7 === 0 ? "bad" : cell % 5 === 0 ? "warn" : "good"}>{!mini && !compact && cell < 8 ? ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "LINK", "AVAX"][cell] : ""}</span>)}</div>;
}

export default function Home() {
  const [active, setActive] = useState("command");
  const content = {
    command: <CommandCenter />,
    brokers: <Brokers />,
    strategies: <Strategies />,
    ai: <AIIntelligence />,
    automation: <Onboarding />,
    settings: <Landing />
  }[active] ?? <CommandCenter />;

  return active === "settings" ? (
    <Landing />
  ) : (
    <div className="app-shell">
      <Sidebar active={active} onChange={setActive} />
      <div className="app-main">
        <Topbar compact />
        {content}
      </div>
    </div>
  );
}
