import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { areAppWritesProtected, isAppRequestAuthorized, isBridgeRequestAuthorized } from "@/lib/backend/auth";
import { submitExecutionOrderFromPlan, listExecutionOrders, reportExecutionOrder } from "@/lib/backend/execution-engine";
import type { DrivePlan, ExecutionOrderStatus } from "@/lib/backend/types";

const orderStatuses = new Set<ExecutionOrderStatus>(["queued", "sent", "filled", "rejected", "cancelled", "dry_run"]);

function parseLimit(value: string | null) {
  const numberValue = value ? Number(value) : 25;
  return Number.isFinite(numberValue) ? Math.min(Math.max(Math.trunc(numberValue), 1), 100) : 25;
}

function parseStatus(value: string | null) {
  return value && orderStatuses.has(value as ExecutionOrderStatus) ? (value as ExecutionOrderStatus) : undefined;
}

export async function GET(request: Request) {
  const appAuthorized = areAppWritesProtected() && isAppRequestAuthorized(request);
  if (!isBridgeRequestAuthorized(request) && !appAuthorized) {
    return unauthorized("invalid execution token");
  }

  const url = new URL(request.url);
  return ok({
    orders: listExecutionOrders(parseLimit(url.searchParams.get("limit")), parseStatus(url.searchParams.get("status")))
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    plan?: unknown;
    dryRun?: unknown;
    source?: unknown;
    report?: unknown;
  };

  try {
    if (body.report && typeof body.report === "object") {
      if (!isBridgeRequestAuthorized(request)) {
        return unauthorized("invalid bridge token");
      }

      const report = body.report as {
        id?: unknown;
        status?: unknown;
        ticket?: unknown;
        retcode?: unknown;
        comment?: unknown;
        raw?: unknown;
      };

      if (typeof report.id !== "string") return badRequest("report.id is required");
      if (typeof report.status !== "string" || !orderStatuses.has(report.status as ExecutionOrderStatus)) {
        return badRequest("report.status is invalid");
      }

      return ok({
        order: await reportExecutionOrder({
          id: report.id,
          status: report.status as ExecutionOrderStatus,
          ticket: typeof report.ticket === "number" ? report.ticket : null,
          retcode: typeof report.retcode === "number" ? report.retcode : null,
          comment: typeof report.comment === "string" ? report.comment : null,
          raw: report.raw
        })
      });
    }

    if (!areAppWritesProtected() || !isAppRequestAuthorized(request)) {
      return unauthorized("invalid app token");
    }

    if (!body.plan || typeof body.plan !== "object") {
      return badRequest("plan is required");
    }

    const order = await submitExecutionOrderFromPlan({
      plan: body.plan as DrivePlan,
      dryRun: body.dryRun !== false,
      source: body.source === "drive" || body.source === "automation" ? body.source : "operator"
    });

    return ok({
      order
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Execution order could not be processed");
  }
}
