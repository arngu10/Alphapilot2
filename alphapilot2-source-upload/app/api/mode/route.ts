import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { isAppRequestAuthorized } from "@/lib/backend/auth";
import { executionState } from "@/lib/backend/seed";
import type { TradingMode } from "@/lib/backend/types";

const validModes: TradingMode[] = ["copilot", "drive", "automation"];

export function GET() {
  return ok(executionState);
}

export async function POST(request: Request) {
  if (!isAppRequestAuthorized(request)) {
    return unauthorized("invalid app token");
  }

  const body = (await request.json()) as { mode?: TradingMode };

  if (!body.mode || !validModes.includes(body.mode)) {
    return badRequest("mode must be one of: copilot, drive, automation");
  }

  if (body.mode === "automation" && executionState.automationLocked) {
    return badRequest(`automation is locked: ${executionState.lockReasons.join("; ")}`);
  }

  executionState.mode = body.mode;
  return ok(executionState);
}
