import { badRequest, ok } from "@/lib/backend/api-response";
import { validateDrivePlan } from "@/lib/backend/drive-validation";
import { sanitizeDrivePlan } from "@/lib/backend/sanitize";
import { drivePlans } from "@/lib/backend/seed";
import { listPersistedDrivePlans, persistDecisionJournalEntry } from "@/lib/backend/supabase";
import type { DrivePlan } from "@/lib/backend/types";

function isDrivePlan(value: unknown): value is DrivePlan {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DrivePlan>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.symbol === "string" &&
    (candidate.side === "long" || candidate.side === "short") &&
    Boolean(candidate.entry) &&
    typeof candidate.stopLoss === "number" &&
    Array.isArray(candidate.targets) &&
    typeof candidate.score === "number" &&
    typeof candidate.rewardRisk === "number"
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    planId?: unknown;
    plan?: unknown;
  };

  let plan: DrivePlan | null = null;

  if (typeof body.planId === "string" && body.planId.trim()) {
    const planId = body.planId.trim();
    const persistedPlans = (await listPersistedDrivePlans()) ?? [];
    plan = persistedPlans.find((item) => item.id === planId) ?? drivePlans.find((item) => item.id === planId) ?? null;
  } else if (isDrivePlan(body.plan)) {
    plan = body.plan;
  }

  if (!plan) {
    return badRequest("Provide a valid planId or Drive plan payload.");
  }

  const validation = validateDrivePlan(plan);

  void persistDecisionJournalEntry({
    kind: "drive",
    symbol: plan.symbol,
    status: validation.verdict === "fail" ? "blocked" : "info",
    summary: `${plan.symbol} Drive plan validation returned ${validation.verdict}.`,
    payload: {
      planId: plan.id,
      verdict: validation.verdict,
      checks: validation.checks
    }
  });

  return ok({
    plan: sanitizeDrivePlan(plan),
    validation
  });
}
