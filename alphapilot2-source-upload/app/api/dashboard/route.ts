import { badRequest, ok } from "@/lib/backend/api-response";
import { getDashboard } from "@/lib/backend/dashboard-engine";

export async function GET() {
  try {
    return ok({
      dashboard: await getDashboard()
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Dashboard could not be generated");
  }
}
