import { ok } from "@/lib/backend/api-response";
import { connectors, getLatestMt5Heartbeat } from "@/lib/backend/seed";
import { sanitizeMt5Heartbeat } from "@/lib/backend/sanitize";

export function GET() {
  return ok({
    connectors: connectors.map((connector) => ({
      id: connector.id,
      kind: connector.kind,
      name: connector.name,
      status: connector.status,
      environment: connector.environment,
      lastHeartbeatAt: connector.lastHeartbeatAt,
      canExecute: connector.canExecute,
      notes: connector.notes
    })),
    latestMt5Heartbeat: sanitizeMt5Heartbeat(getLatestMt5Heartbeat())
  });
}
