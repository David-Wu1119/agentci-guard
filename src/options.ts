import type { Severity } from "./types.js";

export type FailOn = "none" | Severity;

export function parseFailOn(value: string): FailOn {
  if (
    value === "none" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }
  throw new Error("fail-on must be one of none, low, medium, high, critical.");
}
