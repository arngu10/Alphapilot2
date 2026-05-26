import { badRequest, ok } from "@/lib/backend/api-response";
import { getLaunchAudit } from "@/lib/backend/launch-audit";

export async function GET() {
  try {
    return ok({
      audit: await getLaunchAudit()
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Launch audit could not be generated");
  }
}
