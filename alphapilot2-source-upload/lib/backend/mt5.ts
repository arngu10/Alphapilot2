import type { Mt5Heartbeat } from "./types";

export function isMt5Heartbeat(value: unknown): value is Mt5Heartbeat {
  if (!value || typeof value !== "object") return false;

  const heartbeat = value as Partial<Mt5Heartbeat>;
  return (
    typeof heartbeat.ok === "boolean" &&
    typeof heartbeat.timestamp === "string" &&
    Array.isArray(heartbeat.symbols) &&
    Array.isArray(heartbeat.positions)
  );
}
