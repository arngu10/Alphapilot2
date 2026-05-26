import { badRequest, ok } from "@/lib/backend/api-response";
import { getLatestIntelligence } from "@/lib/backend/intelligence-engine";

export async function GET() {
  try {
    return ok({
      intelligence: await getLatestIntelligence()
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Latest intelligence could not be generated");
  }
}
