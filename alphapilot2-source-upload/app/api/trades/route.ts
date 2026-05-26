import { ok } from "@/lib/backend/api-response";
import { trades } from "@/lib/backend/seed";

export function GET() {
  return ok(trades);
}
