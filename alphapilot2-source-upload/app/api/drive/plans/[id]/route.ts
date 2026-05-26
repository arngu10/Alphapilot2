import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { isAppRequestAuthorized } from "@/lib/backend/auth";
import { validateDrivePlan } from "@/lib/backend/drive-validation";
import { sanitizeDrivePlan } from "@/lib/backend/sanitize";
import { drivePlans, updateDrivePlanStatus } from "@/lib/backend/seed";
import { listPersistedDrivePlans, persistDecisionJournalEntry, updatePersistedDrivePlanStatus } from "@/lib/backend/supabase";
import type { DrivePlanStatus } from "@/lib/backend/types";

const allowedStatuses: DrivePlanStatus[] = ["review_ready", "published", "rejected"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAppRequestAuthorized(request)) {
    return unauthorized("invalid app token");
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status;

  if (typeof status !== "string" || !allowedStatuses.includes(status as DrivePlanStatus)) {
    return badRequest("invalid Drive plan status");
  }

  const currentPersistedPlan = ((await listPersistedDrivePlans()) ?? []).find((item) => item.id === id) ?? null;
  const currentMemoryPlan = drivePlans.find((item) => item.id === id) ?? null;
  const plan = currentPersistedPlan ?? currentMemoryPlan;
  if (!plan) {
    return badRequest("Drive plan not found");
  }

  const validation = validateDrivePlan(plan);
  if (status === "published" && validation.verdict === "fail") {
    void persistDecisionJournalEntry({
      kind: "drive",
      symbol: plan.symbol,
      status: "blocked",
      summary: `Drive plan ${id} publish blocked by validation.`,
      payload: {
        planId: id,
        requestedStatus: status,
        validation
      }
    });

    return badRequest("Drive plan cannot be published until validation failures are cleared.");
  }

  const persisted = await updatePersistedDrivePlanStatus(id, status as DrivePlanStatus);
  const memory = updateDrivePlanStatus(id, status as DrivePlanStatus);
  const updatedPlan = persisted ?? memory ?? { ...plan, status: status as DrivePlanStatus };

  void persistDecisionJournalEntry({
    kind: "drive",
    symbol: updatedPlan.symbol,
    status: status === "rejected" ? "blocked" : "info",
    summary: `Drive plan ${id} marked ${status}.`,
    payload: {
      planId: id,
      status,
      plan: updatedPlan,
      validation
    }
  });

  return ok({
    plan: sanitizeDrivePlan(updatedPlan),
    validation
  });
}
