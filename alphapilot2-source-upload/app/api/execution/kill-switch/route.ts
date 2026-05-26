import { ok, unauthorized } from "@/lib/backend/api-response";
import { isAppRequestAuthorized } from "@/lib/backend/auth";
import { executionState } from "@/lib/backend/seed";

export function GET() {
  return ok({
    active: executionState.killSwitchActive
  });
}

export async function POST(request: Request) {
  if (!isAppRequestAuthorized(request)) {
    return unauthorized("invalid app token");
  }

  const body = (await request.json()) as { active?: boolean };
  executionState.killSwitchActive = Boolean(body.active);

  if (executionState.killSwitchActive) {
    executionState.mode = "copilot";
    executionState.automationLocked = true;
    if (!executionState.lockReasons.includes("Kill switch is active")) {
      executionState.lockReasons.push("Kill switch is active");
    }
  }

  return ok(executionState);
}
