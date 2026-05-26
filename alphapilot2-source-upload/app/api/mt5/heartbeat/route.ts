import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { isBridgeRequestAuthorized } from "@/lib/backend/auth";
import { isMt5Heartbeat } from "@/lib/backend/mt5";
import { sanitizeMt5Heartbeat } from "@/lib/backend/sanitize";
import { getLatestMt5Heartbeat, setLatestMt5Heartbeat } from "@/lib/backend/seed";
import { getLatestPersistedMt5Heartbeat, persistMt5Heartbeat } from "@/lib/backend/supabase";

export async function GET() {
  return ok({
    connectorId: "vantage-mt5",
    heartbeat: sanitizeMt5Heartbeat(getLatestMt5Heartbeat() ?? (await getLatestPersistedMt5Heartbeat()))
  });
}

export async function POST(request: Request) {
  if (!isBridgeRequestAuthorized(request)) {
    return unauthorized("invalid bridge token");
  }

  const body = (await request.json()) as unknown;

  if (!isMt5Heartbeat(body)) {
    return badRequest("invalid MT5 heartbeat payload");
  }

  setLatestMt5Heartbeat(body);
  await persistMt5Heartbeat(body);

  return ok({
    connectorId: "vantage-mt5",
    accepted: true
  });
}
