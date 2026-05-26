import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { isAppRequestAuthorized } from "@/lib/backend/auth";
import { riskSettings } from "@/lib/backend/seed";
import { canExecuteLiveOrders, getRiskChecks } from "@/lib/backend/risk-engine";
import { getLatestPersistedMt5Heartbeat } from "@/lib/backend/supabase";
import type { RiskSettings } from "@/lib/backend/types";

const booleanSettings: Array<keyof RiskSettings> = [
  "stopLossRequired",
  "killSwitchEnabled",
  "newsBlackoutEnabled",
  "correlationAutoReduceEnabled",
  "dailyLimitAutoPauseEnabled",
  "drawdownPanicCloseEnabled",
  "asiaSessionTradingEnabled",
  "splitTakeProfitEnabled",
  "dynamicStopTrailingEnabled"
];
type MutableRiskSettings = Record<string, boolean | number | string[]>;

export async function GET() {
  const latestMt5Heartbeat = await getLatestPersistedMt5Heartbeat();
  return ok({
    settings: riskSettings,
    checks: getRiskChecks(latestMt5Heartbeat),
    canExecuteLiveOrders: canExecuteLiveOrders()
  });
}

export async function POST(request: Request) {
  if (!isAppRequestAuthorized(request)) {
    return unauthorized("invalid app token");
  }

  const body = (await request.json().catch(() => ({}))) as Partial<RiskSettings>;
  const latestMt5Heartbeat = await getLatestPersistedMt5Heartbeat();

  if (body.maxRiskPerTradePct !== undefined) {
    if (typeof body.maxRiskPerTradePct !== "number" || body.maxRiskPerTradePct <= 0 || body.maxRiskPerTradePct > 5) {
      return badRequest("maxRiskPerTradePct must be between 0 and 5");
    }
    riskSettings.maxRiskPerTradePct = body.maxRiskPerTradePct;
  }

  if (body.maxDailyLossPct !== undefined) {
    if (typeof body.maxDailyLossPct !== "number" || body.maxDailyLossPct <= 0 || body.maxDailyLossPct > 20) {
      return badRequest("maxDailyLossPct must be between 0 and 20");
    }
    riskSettings.maxDailyLossPct = body.maxDailyLossPct;
  }

  if (body.maxOpenTrades !== undefined) {
    if (!Number.isInteger(body.maxOpenTrades) || body.maxOpenTrades < 1 || body.maxOpenTrades > 25) {
      return badRequest("maxOpenTrades must be an integer between 1 and 25");
    }
    riskSettings.maxOpenTrades = body.maxOpenTrades;
  }

  for (const key of booleanSettings) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") return badRequest(`${key} must be boolean`);
      (riskSettings as unknown as MutableRiskSettings)[key] = body[key] as boolean;
    }
  }

  return ok({
    settings: riskSettings,
    checks: getRiskChecks(latestMt5Heartbeat),
    canExecuteLiveOrders: canExecuteLiveOrders()
  });
}
