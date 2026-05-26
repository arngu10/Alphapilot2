import type { ProviderAuditItem } from "./types";

const cryptoBackupProviderIds = new Set(["kraken", "hyperliquid"]);

export function getBlockingFailedSources(sourceAudit: ProviderAuditItem[]) {
  const fetchedProviderIds = new Set(
    sourceAudit.filter((source) => source.status === "fetched").map((source) => source.id)
  );
  const cryptoDepthCovered = [...cryptoBackupProviderIds].some((providerId) => fetchedProviderIds.has(providerId));

  return sourceAudit.filter((source) => {
    if (source.status !== "failed") return false;

    if (source.id === "binance" && cryptoDepthCovered) {
      return false;
    }

    return true;
  });
}

export function summarizeProviderHealth(sourceAudit: ProviderAuditItem[]) {
  const blockingFailedSources = getBlockingFailedSources(sourceAudit);

  return {
    failedCount: blockingFailedSources.length,
    failedSources: blockingFailedSources.map((source) => source.label),
    fetchedSources: sourceAudit.filter((source) => source.status === "fetched").map((source) => source.label),
    substitutedSources: sourceAudit
      .filter(
        (source) =>
          source.status === "failed" &&
          source.id === "binance" &&
          sourceAudit.some((item) => cryptoBackupProviderIds.has(item.id) && item.status === "fetched")
      )
      .map((source) => source.label)
  };
}
