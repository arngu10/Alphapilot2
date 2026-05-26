import { badRequest, ok } from "@/lib/backend/api-response";
import { createCopilotBrief } from "@/lib/backend/copilot-engine";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const prompt = url.searchParams.get("prompt");

  try {
    return ok({
      brief: await createCopilotBrief({ symbol, prompt })
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Copilot brief could not be generated");
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { symbol?: unknown; prompt?: unknown };
  const symbol = typeof body.symbol === "string" ? body.symbol : null;
  const prompt = typeof body.prompt === "string" ? body.prompt : null;

  try {
    return ok({
      brief: await createCopilotBrief({ symbol, prompt })
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Copilot brief could not be generated");
  }
}
