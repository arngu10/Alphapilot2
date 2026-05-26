import { badRequest, ok, unauthorized } from "@/lib/backend/api-response";
import { isBridgeRequestAuthorized } from "@/lib/backend/auth";
import { listUpcomingEconomicEvents, persistEconomicEvent } from "@/lib/backend/supabase";
import type { EconomicEventImpact } from "@/lib/backend/types";

const validImpacts = new Set<EconomicEventImpact>(["low", "medium", "high"]);

export async function GET() {
  const events = (await listUpcomingEconomicEvents(48)) ?? [];

  return ok({
    events
  });
}

export async function POST(request: Request) {
  if (!isBridgeRequestAuthorized(request)) {
    return unauthorized("invalid bridge token");
  }

  const body = (await request.json()) as {
    title?: unknown;
    currency?: unknown;
    impact?: unknown;
    startsAt?: unknown;
    source?: unknown;
    notes?: unknown;
  };

  if (typeof body.title !== "string" || body.title.trim().length < 3) {
    return badRequest("title is required");
  }

  if (typeof body.currency !== "string" || body.currency.trim().length < 3) {
    return badRequest("currency is required");
  }

  if (typeof body.impact !== "string" || !validImpacts.has(body.impact as EconomicEventImpact)) {
    return badRequest("impact must be low, medium, or high");
  }

  if (typeof body.startsAt !== "string" || Number.isNaN(new Date(body.startsAt).getTime())) {
    return badRequest("startsAt must be an ISO date string");
  }

  const event = await persistEconomicEvent({
    title: body.title.trim(),
    currency: body.currency.trim().toUpperCase(),
    impact: body.impact as EconomicEventImpact,
    startsAt: new Date(body.startsAt).toISOString(),
    source: "manual",
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null
  });

  if (!event) {
    return badRequest("could not persist economic event");
  }

  return ok({
    event
  });
}
