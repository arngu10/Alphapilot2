import { getRiskChecks } from "./risk-engine";
import { connectors, executionState, riskSettings } from "./seed";
import { getLatestPersistedMt5Heartbeat } from "./supabase";
import { getTradeCards } from "./trade-cards";

function getSessionLabel(sessionName: string) {
  if (sessionName === "Asia") return "Asia session";
  if (sessionName === "London") return "London session";
  if (sessionName === "London/NY") return "London/NY overlap";
  if (sessionName === "NY Afternoon") return "NY afternoon";
  return "Dead zone";
}

function getDashboardHeadline(priority: Awaited<ReturnType<typeof getTradeCards>>["priority"]) {
  if (!priority) return "Scanner is waiting for live market telemetry.";
  if (priority.status === "drive_ready") {
    return `${priority.symbol} is ready for Drive review.`;
  }
  if (priority.status === "blackout") return `${priority.symbol} is in a news blackout.`;
  if (priority.status === "halted") return "Scanner is outside active session rules.";
  return `${priority.symbol} is on watch.`;
}

function getQuickActions(cards: Awaited<ReturnType<typeof getTradeCards>>["cards"]) {
  const priority = cards.find((card) => card.status === "drive_ready") ?? cards[0] ?? null;

  return [
    {
      id: "refresh",
      label: "Refresh scanner",
      command: "refresh",
      enabled: true,
      symbol: null
    },
    {
      id: "copilot_brief",
      label: priority ? `Ask Copilot about ${priority.symbol}` : "Ask Copilot",
      command: "copilot_brief",
      enabled: Boolean(priority),
      symbol: priority?.symbol ?? null
    },
    {
      id: "drive_plan",
      label: priority ? `Generate ${priority.symbol} Drive plan` : "Generate Drive plan",
      command: "drive_plan",
      enabled: priority?.status === "drive_ready",
      symbol: priority?.symbol ?? null
    },
    {
      id: "automation_simulation",
      label: "Run automation simulation",
      command: "automation_simulation",
      enabled: true,
      symbol: null
    }
  ];
}

export async function getDashboard() {
  const tradeCards = await getTradeCards();
  const latestHeartbeat = await getLatestPersistedMt5Heartbeat();
  const riskChecks = getRiskChecks(latestHeartbeat);
  const mt5 = connectors.find((connector) => connector.id === "vantage-mt5");
  const criticalRiskFailures = riskChecks.filter((check) => check.status === "fail");
  const reviewReadyCount = tradeCards.cards.filter((card) => card.status === "drive_ready").length;

  const alerts = [
    ...(criticalRiskFailures.length ? [`${criticalRiskFailures.length} risk check(s) need attention.`] : []),
    ...(executionState.killSwitchActive ? ["Kill switch is active."] : []),
    ...(executionState.automationLocked ? ["Automation is locked and simulation-only."] : []),
    ...(mt5?.status === "connected" ? [] : ["MT5 heartbeat has not been seen in this server process."])
  ];

  return {
    generatedAt: tradeCards.generatedAt,
    status: {
      headline: getDashboardHeadline(tradeCards.priority),
      session: getSessionLabel(tradeCards.session.name),
      sessionDetail: tradeCards.session.bias,
      mode: executionState.mode,
      mt5Connected: mt5?.status === "connected" || Boolean(latestHeartbeat?.ok),
      automationLocked: executionState.automationLocked,
      reviewReadyCount
    },
    modeCards: [
      {
        id: "copilot",
        label: "Copilot",
        state: "ready",
        description: "Ask for analysis, context, and plain-English trade reasoning.",
        enabled: true
      },
      {
        id: "drive",
        label: "Drive",
        state: reviewReadyCount > 0 ? "ready" : "waiting",
        description: "Generate manual-review trade plans from the live scanner.",
        enabled: reviewReadyCount > 0
      },
      {
        id: "automation",
        label: "Automation",
        state: executionState.automationLocked ? "locked" : "simulation",
        description: "Simulation-only until governance, audit, and execution controls are approved.",
        enabled: true
      }
    ],
    quickActions: getQuickActions(tradeCards.cards),
    marketCards: tradeCards.cards,
    priority: tradeCards.priority,
    risk: {
      maxRiskPerTradePct: riskSettings.maxRiskPerTradePct,
      maxDailyLossPct: riskSettings.maxDailyLossPct,
      maxOpenTrades: riskSettings.maxOpenTrades,
      checks: riskChecks
    },
    alerts
  };
}
