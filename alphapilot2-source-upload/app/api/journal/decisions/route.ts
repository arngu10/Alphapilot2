import { ok } from "@/lib/backend/api-response";
import { listDecisionJournalEntries } from "@/lib/backend/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  return ok({
    entries: (await listDecisionJournalEntries(Number.isFinite(limit) ? limit : 50)) ?? []
  });
}
