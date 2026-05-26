import { ok } from "@/lib/backend/api-response";
import { getOperatorStatus } from "@/lib/backend/operator-status";

export async function GET() {
  return ok({
    operator: await getOperatorStatus()
  });
}
