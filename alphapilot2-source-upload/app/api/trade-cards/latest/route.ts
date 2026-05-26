import { badRequest, ok } from "@/lib/backend/api-response";
import { getTradeCards } from "@/lib/backend/trade-cards";

export async function GET() {
  try {
    return ok({
      tradeCards: await getTradeCards()
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Trade cards could not be generated");
  }
}
