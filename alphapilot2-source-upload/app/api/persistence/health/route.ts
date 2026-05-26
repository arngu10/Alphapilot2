import { ok } from "@/lib/backend/api-response";
import { getSupabaseDiagnostics } from "@/lib/backend/supabase";

export async function GET() {
  return ok({
    persistence: await getSupabaseDiagnostics()
  });
}
