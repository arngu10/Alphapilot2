import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { isAppRequestAuthorized } from "@/lib/backend/auth";
import { createDrivePlan } from "@/lib/backend/drive-engine";
import { sanitizeDrivePlan, sanitizeDrivePlans } from "@/lib/backend/sanitize";
import { drivePlans, riskSettings } from "@/lib/backend/seed";
import { listPersistedDrivePlans, persistDecisionJournalEntry } from "@/lib/backend/supabase";

export async function GET() {
  return ok({
    plans: sanitizeDrivePlans((await listPersistedDrivePlans()) ?? drivePlans)
  });
}

export async function POST(request: Request) {
  if (!isAppRequestAuthorized(request)) {
    return unauthorized("invalid app token");
  }

  const body = (await request.json().catch(() => ({}))) as { symbol?: unknown };
  const symbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : "XAUUSD";

  if (!riskSettings.allowedSymbols.includes(symbol)) {
    return badRequest(`${symbol} is not enabled for Drive planning`);
  }

  try {
    const plan = await createDrivePlan(symbol);
    void persistDecisionJournalEntry({
      kind: "drive",
      symbol,
      status: "accepted",
      summary: `${symbol} Drive plan generated at ${plan.score.toFixed(1)}/10.`,
      payload: {
        planId: plan.id,
        side: plan.side,
        score: plan.score,
        confidence: plan.confidence,
        entry: plan.entry,
        stopLoss: plan.stopLoss,
        targets: plan.targets,
        rewardRisk: plan.rewardRisk
      }
    });

    return ok({
      plan: sanitizeDrivePlan(plan)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive plan could not be generated";
    void persistDecisionJournalEntry({
      kind: "drive",
      symbol,
      status: "blocked",
      summary: `${symbol} Drive plan blocked: ${message}`,
      payload: {
        reason: message
      }
    });
    return badRequest(message);
  }
}
