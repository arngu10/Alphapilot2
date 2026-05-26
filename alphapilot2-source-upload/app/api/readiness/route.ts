import { badRequest, ok } from "@/lib/backend/api-response";
import { getReadiness } from "@/lib/backend/readiness-engine";

export async function GET() {
  try {
    return ok({
      readiness: await getReadiness()
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Readiness could not be generated");
  }
}
