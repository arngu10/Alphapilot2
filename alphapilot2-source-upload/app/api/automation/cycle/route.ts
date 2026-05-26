import { badRequest, ok } from "@/lib/backend/api-response";
import { getLatestAutomationCycle, listAutomationCycles, runAutomationCycle } from "@/lib/backend/automation-engine";
import { sanitizeDrivePlan } from "@/lib/backend/sanitize";

function cleanLimit(value: string | null) {
  const numberValue = Number(value ?? "10");
  if (!Number.isFinite(numberValue)) return 10;
  return Math.min(Math.max(Math.trunc(numberValue), 1), 25);
}

function sanitizeCycle(cycle: Awaited<ReturnType<typeof runAutomationCycle>> | null) {
  if (!cycle) return null;

  return {
    ...cycle,
    decisions: cycle.decisions.map((decision) => ({
      ...decision,
      proposedPlan: decision.proposedPlan ? sanitizeDrivePlan(decision.proposedPlan) : undefined
    }))
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const run = url.searchParams.get("run") === "1";
  const includeHistory = url.searchParams.get("history") === "1";

  try {
    const cycle = run ? await runAutomationCycle() : getLatestAutomationCycle();
    return ok({
      cycle: sanitizeCycle(cycle),
      history: includeHistory ? listAutomationCycles(cleanLimit(url.searchParams.get("limit"))).map(sanitizeCycle) : undefined
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Automation cycle could not be generated");
  }
}

export async function POST() {
  try {
    return ok({
      cycle: sanitizeCycle(await runAutomationCycle())
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Automation cycle could not be generated");
  }
}
