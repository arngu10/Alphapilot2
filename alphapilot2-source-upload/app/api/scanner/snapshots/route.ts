import { ok } from "@/lib/backend/api-response";
import { sanitizeScannerSnapshot } from "@/lib/backend/sanitize";
import { getLatestScannerSnapshot, listScannerSnapshots } from "@/lib/backend/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeHistory = url.searchParams.get("history") === "1";
  const limit = Number(url.searchParams.get("limit") ?? "20");

  const [latest, history] = await Promise.all([
    getLatestScannerSnapshot(),
    includeHistory ? listScannerSnapshots(Number.isFinite(limit) ? limit : 20) : Promise.resolve(null)
  ]);

  return ok({
    latest: sanitizeScannerSnapshot(latest),
    history: history?.map(sanitizeScannerSnapshot) ?? undefined
  });
}
