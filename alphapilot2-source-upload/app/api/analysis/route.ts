import { ok } from "@/lib/backend/api-response";
import { runScanner } from "@/lib/backend/scanner-engine";
import { sanitizeAnalysis } from "@/lib/backend/sanitize";

export async function GET() {
  const { analysis } = await runScanner("analysis");

  return ok({
    analysis: sanitizeAnalysis(analysis)
  });
}
