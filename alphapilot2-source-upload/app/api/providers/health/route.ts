import { ok } from "@/lib/backend/api-response";
import { areAppWritesProtected, getBridgeToken } from "@/lib/backend/auth";
import { getExternalMarketContext } from "@/lib/backend/data-providers";
import { getBlockingFailedSources, summarizeProviderHealth } from "@/lib/backend/provider-health";
import { scannerHardRules, scannerSources } from "@/lib/backend/scanner-policy";

function healthScore(context: Awaited<ReturnType<typeof getExternalMarketContext>>) {
  if (context.audit.length === 0) return "unknown";
  const failed = getBlockingFailedSources(context.audit).length;
  const configured = context.audit.filter((source) => source.status !== "not_configured").length;

  if (configured === 0) return "not_configured";
  if (failed === 0) return "healthy";
  if (failed <= scannerHardRules.maxFailedSources) return "degraded";
  return "unhealthy";
}

function isConfigured(key: string) {
  return Boolean(process.env[key]?.trim());
}

export async function GET() {
  const context = await getExternalMarketContext();
  const providerSummary = summarizeProviderHealth(context.audit);
  const statuses = context.audit.map((item) => item.status);
  const envKeys = Array.from(new Set(scannerSources.flatMap((source) => source.envKeys))).sort();
  const configuredEnv = envKeys.map((key) => ({
    key,
    configured: isConfigured(key)
  }));
  const warnings = [
    ...(isConfigured("Value")
      ? ["A Vercel environment variable named `Value` exists. That usually means an API key was added with the wrong key name."]
      : []),
    ...(isConfigured("SUPABASE_SERVICE_ROLE_KEY") && !isConfigured("SUPABASE_URL")
      ? ["SUPABASE_SERVICE_ROLE_KEY is configured but SUPABASE_URL is missing."]
      : []),
    ...(isConfigured("SUPABASE_URL") && !isConfigured("SUPABASE_SERVICE_ROLE_KEY")
      ? ["SUPABASE_URL is configured but SUPABASE_SERVICE_ROLE_KEY is missing."]
      : [])
  ];

  return ok({
    status: healthScore(context),
    generatedAt: context.generatedAt,
    failedCount: providerSummary.failedCount,
    configuredCount: statuses.filter((status) => status !== "not_configured").length,
    substitutedSources: providerSummary.substitutedSources,
    config: {
      bridgeTokenConfigured: Boolean(getBridgeToken()),
      appWritesProtected: areAppWritesProtected(),
      supabaseConfigured: isConfigured("SUPABASE_URL") && isConfigured("SUPABASE_SERVICE_ROLE_KEY"),
      configuredEnv,
      warnings
    },
    providers: context.audit.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      fetchedAt: item.fetchedAt,
      detail: item.detail ? item.detail.slice(0, 220) : undefined
    }))
  });
}
