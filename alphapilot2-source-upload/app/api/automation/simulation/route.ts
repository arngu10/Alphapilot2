import { badRequest, ok } from "@/lib/backend/api-response";
import { getAutomationSimulation } from "@/lib/backend/automation-engine";

export async function GET() {
  try {
    return ok({
      simulation: await getAutomationSimulation()
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Automation simulation could not be generated");
  }
}
