import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { getAutomationSimulation, runAutomationCycle } from "@/lib/backend/automation-engine";
import { areAppWritesProtected, isAppRequestAuthorized } from "@/lib/backend/auth";
import { createCopilotBrief } from "@/lib/backend/copilot-engine";
import { createDrivePlan } from "@/lib/backend/drive-engine";
import { listExecutionOrders } from "@/lib/backend/execution-engine";
import { getLatestIntelligence } from "@/lib/backend/intelligence-engine";
import { getLaunchAudit } from "@/lib/backend/launch-audit";
import { getOperatorStatus } from "@/lib/backend/operator-status";
import { getExternalMarketContext } from "@/lib/backend/data-providers";
import { summarizeProviderHealth } from "@/lib/backend/provider-health";
import { getReadiness } from "@/lib/backend/readiness-engine";
import { isLiveExecutionEnabled } from "@/lib/backend/risk-engine";
import { sanitizeDrivePlan, sanitizeScannerSnapshot } from "@/lib/backend/sanitize";
import { runScanner } from "@/lib/backend/scanner-engine";
import { executionState, riskSettings } from "@/lib/backend/seed";
import { listDecisionJournalEntries, listScannerSnapshots, listUpcomingEconomicEvents } from "@/lib/backend/supabase";
import type { TradingMode } from "@/lib/backend/types";

const validModes: TradingMode[] = ["copilot", "drive", "automation"];
const validActions = [
  "status",
  "refresh",
  "copilot_brief",
  "drive_plan",
  "automation_simulation",
  "automation_cycle",
  "provider_health",
  "readiness",
  "launch_audit",
  "calendar_upcoming",
  "scanner_snapshots",
  "decision_journal",
  "execution_orders",
  "set_mode",
  "kill_switch",
  "unlock_live_execution",
  "lock_live_execution"
] as const;

type CommandAction = (typeof validActions)[number];

const postOnlyActions = new Set<CommandAction>(["set_mode", "kill_switch", "unlock_live_execution", "lock_live_execution"]);

function cleanSymbol(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, 20) : "XAUUSD";
}

function cleanPrompt(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function cleanLimit(value: unknown, fallback = 20, max = 100) {
  const numberValue = typeof value === "string" || typeof value === "number" ? Number(value) : fallback;
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(Math.max(Math.trunc(numberValue), 1), max);
}

function isCommandAction(value: unknown): value is CommandAction {
  return typeof value === "string" && validActions.includes(value as CommandAction);
}

async function executeCommand(input: {
  action: CommandAction;
  symbol?: unknown;
  prompt?: unknown;
  mode?: unknown;
  active?: unknown;
  limit?: unknown;
  hours?: unknown;
  confirmation?: unknown;
}) {
  if (input.action === "status") {
    return {
      action: input.action,
      operator: await getOperatorStatus()
    };
  }

  if (input.action === "provider_health") {
    const context = await getExternalMarketContext();
    return {
      action: input.action,
      generatedAt: context.generatedAt,
      health: summarizeProviderHealth(context.audit),
      providers: context.audit.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        fetchedAt: item.fetchedAt,
        detail: item.detail ? item.detail.slice(0, 220) : undefined
      }))
    };
  }

  if (input.action === "readiness") {
    return {
      action: input.action,
      readiness: await getReadiness()
    };
  }

  if (input.action === "launch_audit") {
    return {
      action: input.action,
      audit: await getLaunchAudit()
    };
  }

  if (input.action === "calendar_upcoming") {
    return {
      action: input.action,
      hours: cleanLimit(input.hours, 48, 168),
      events: (await listUpcomingEconomicEvents(cleanLimit(input.hours, 48, 168))) ?? []
    };
  }

  if (input.action === "scanner_snapshots") {
    const history = (await listScannerSnapshots(cleanLimit(input.limit, 10, 50))) ?? [];
    return {
      action: input.action,
      history: history.map(sanitizeScannerSnapshot)
    };
  }

  if (input.action === "decision_journal") {
    return {
      action: input.action,
      entries: (await listDecisionJournalEntries(cleanLimit(input.limit, 20, 100))) ?? []
    };
  }

  if (input.action === "execution_orders") {
    return {
      action: input.action,
      orders: listExecutionOrders(cleanLimit(input.limit, 25, 100))
    };
  }

  if (input.action === "refresh") {
    const scan = await runScanner("manual");
    return {
      action: input.action,
      status: scan.decisionStatus,
      generatedAt: scan.analysis.generatedAt,
      priority: scan.analysis.priority
        ? {
            symbol: scan.analysis.priority.symbol,
            bias: scan.analysis.priority.bias,
            score: scan.analysis.priority.score,
            verdict: scan.analysis.priority.verdict
          }
        : null,
      eligibleMarkets: scan.eligibleMarkets.map((market) => ({
        symbol: market.symbol,
        bias: market.bias,
        score: market.score
      })),
      failedSources: scan.failedSources.map((source) => source.label),
      intelligence: await getLatestIntelligence()
    };
  }

  if (input.action === "copilot_brief") {
    return {
      action: input.action,
      brief: await createCopilotBrief({
        prompt: cleanPrompt(input.prompt),
        symbol: cleanSymbol(input.symbol)
      })
    };
  }

  if (input.action === "drive_plan") {
    const symbol = cleanSymbol(input.symbol);
    if (!riskSettings.allowedSymbols.includes(symbol)) {
      throw new Error(`${symbol} is not enabled for Drive planning`);
    }

    const plan = await createDrivePlan(symbol);
    return {
      action: input.action,
      plan: sanitizeDrivePlan(plan)
    };
  }

  if (input.action === "automation_simulation") {
    return {
      action: input.action,
      simulation: await getAutomationSimulation()
    };
  }

  if (input.action === "automation_cycle") {
    return {
      action: input.action,
      cycle: await runAutomationCycle()
    };
  }

  if (input.action === "set_mode") {
    if (typeof input.mode !== "string" || !validModes.includes(input.mode as TradingMode)) {
      throw new Error("mode must be one of: copilot, drive, automation");
    }

    if (input.mode === "automation" && executionState.automationLocked) {
      throw new Error(`automation is locked: ${executionState.lockReasons.join("; ")}`);
    }

    executionState.mode = input.mode as TradingMode;
    return {
      action: input.action,
      executionState,
      intelligence: await getLatestIntelligence()
    };
  }

  if (input.action === "unlock_live_execution") {
    if (input.confirmation !== "UNLOCK LIVE AUTOMATION") {
      throw new Error("confirmation must be UNLOCK LIVE AUTOMATION");
    }

    if (!areAppWritesProtected()) {
      throw new Error("ALPHAPILOT_APP_TOKEN must be configured before unlocking live automation");
    }

    if (!isLiveExecutionEnabled()) {
      throw new Error("ALPHAPILOT_LIVE_EXECUTION_ENABLED must be true before unlocking live automation");
    }

    if (executionState.killSwitchActive) {
      throw new Error("kill switch is active");
    }

    executionState.automationLocked = false;
    executionState.lockReasons = [];
    executionState.mode = "automation";
    return {
      action: input.action,
      executionState,
      audit: await getLaunchAudit()
    };
  }

  if (input.action === "lock_live_execution") {
    executionState.automationLocked = true;
    if (!executionState.lockReasons.includes("Operator locked live automation")) {
      executionState.lockReasons.unshift("Operator locked live automation");
    }
    executionState.mode = "drive";
    return {
      action: input.action,
      executionState,
      audit: await getLaunchAudit()
    };
  }

  executionState.killSwitchActive = Boolean(input.active);
  if (executionState.killSwitchActive) {
    executionState.mode = "copilot";
    executionState.automationLocked = true;
    if (!executionState.lockReasons.includes("Kill switch is active")) {
      executionState.lockReasons.push("Kill switch is active");
    }
  }

  return {
    action: input.action,
    executionState,
    intelligence: await getLatestIntelligence()
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedAction = url.searchParams.get("action");
  const action = isCommandAction(requestedAction) ? requestedAction : null;

  if (action) {
    if (postOnlyActions.has(action)) {
      return badRequest(`${action} must be called with POST`);
    }

    try {
      return ok(
        await executeCommand({
          action,
          symbol: url.searchParams.get("symbol"),
          prompt: url.searchParams.get("prompt"),
          mode: url.searchParams.get("mode"),
          active: url.searchParams.get("active") === "1",
          limit: url.searchParams.get("limit"),
          hours: url.searchParams.get("hours"),
          confirmation: url.searchParams.get("confirmation")
        })
      );
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Command could not be executed");
    }
  }

  return ok({
    capabilities: {
      actions: validActions,
      modes: validModes,
      allowedSymbols: riskSettings.allowedSymbols,
      automationLocked: executionState.automationLocked,
      protectedWrites: areAppWritesProtected()
    },
    intelligence: await getLatestIntelligence()
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    symbol?: unknown;
    prompt?: unknown;
    mode?: unknown;
    active?: unknown;
    limit?: unknown;
    hours?: unknown;
    confirmation?: unknown;
  };

  if (!isCommandAction(body.action)) {
    return badRequest(`action must be one of: ${validActions.join(", ")}`);
  }

  if (!isAppRequestAuthorized(request)) {
    return unauthorized("invalid app token");
  }

  try {
    return ok(await executeCommand(body as Parameters<typeof executeCommand>[0]));
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Command could not be executed");
  }
}
