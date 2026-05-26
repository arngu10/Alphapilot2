import { ok } from "@/lib/backend/api-response";
import { connectors, executionState, getLatestMt5Heartbeat } from "@/lib/backend/seed";
import { getLatestPersistedMt5Heartbeat } from "@/lib/backend/supabase";

export async function GET() {
  const latestMt5Heartbeat = getLatestMt5Heartbeat() ?? (await getLatestPersistedMt5Heartbeat());

  return ok({
    service: "alphapilot-api",
    status: "healthy",
    mode: executionState.mode,
    mt5HeartbeatAt: latestMt5Heartbeat?.timestamp ?? null,
    connectors: connectors.map((connector) => ({
      id: connector.id,
      status: connector.status,
      canExecute: connector.canExecute
    }))
  });
}
