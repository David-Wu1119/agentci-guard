import type { PermissionDefault, PermissionLevel } from "./types.js";

export type EffectivePermissions = {
  default: PermissionLevel;
  scopes: Record<string, PermissionLevel>;
  source:
    | "workflow"
    | "job"
    | "configured-default"
    | "github-default-unknown"
    | "reusable-merge";
};

export type Reachability = {
  events: string[];
  complete: boolean;
};

export const UNTRUSTED_EVENTS = new Set([
  "pull_request",
  "pull_request_target",
  "issue_comment",
  "issues",
  "pull_request_review",
  "pull_request_review_comment",
  "discussion",
  "discussion_comment",
]);

export const SENSITIVE_WRITE_SCOPES = new Set([
  "contents",
  "pull-requests",
  "issues",
  "discussions",
  "packages",
  "deployments",
]);

export function normalizeTriggers(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  if (isRecord(raw)) return Object.keys(raw);
  return [];
}

export function resolvePermissions(
  workflowRaw: unknown,
  jobRaw: unknown,
  configuredDefault?: PermissionDefault,
  ceiling?: EffectivePermissions,
): EffectivePermissions {
  let effective: EffectivePermissions;
  if (jobRaw !== undefined) {
    effective = normalizeExplicitPermissions(jobRaw, "job");
  } else if (workflowRaw !== undefined) {
    effective = normalizeExplicitPermissions(workflowRaw, "workflow");
  } else if (configuredDefault !== undefined) {
    effective = normalizeExplicitPermissions(
      configuredDefault,
      "configured-default",
    );
  } else {
    effective = {
      default: "unknown",
      scopes: {},
      source: "github-default-unknown",
    };
  }

  return ceiling ? intersectPermissions(ceiling, effective) : effective;
}

export function permissionLevel(
  permissions: EffectivePermissions,
  scope: string,
): PermissionLevel {
  return permissions.scopes[scope] ?? permissions.default;
}

export function hasSensitiveWrite(permissions: EffectivePermissions): boolean {
  return [...SENSITIVE_WRITE_SCOPES].some(
    (scope) => permissionLevel(permissions, scope) === "write",
  );
}

export function hasUnknownSensitivePermission(
  permissions: EffectivePermissions,
): boolean {
  return [...SENSITIVE_WRITE_SCOPES].some(
    (scope) => permissionLevel(permissions, scope) === "unknown",
  );
}

export function describePermissions(permissions: EffectivePermissions): string {
  return JSON.stringify({
    source: permissions.source,
    default: permissions.default,
    scopes: permissions.scopes,
  });
}

export function mergeEnvironment(...layers: unknown[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const layer of layers) {
    if (!isRecord(layer)) continue;
    for (const [key, value] of Object.entries(layer)) {
      merged[key] =
        typeof value === "string" ? value : JSON.stringify(value ?? "");
    }
  }
  return merged;
}

/**
 * Narrow workflow triggers using common `github.event_name` predicates.
 *
 * Unsupported event-name expressions are retained conservatively and marked
 * incomplete instead of silently guessing.
 */
export function narrowEvents(
  events: string[],
  rawCondition: unknown,
): Reachability {
  if (
    typeof rawCondition !== "string" ||
    !rawCondition.includes("event_name")
  ) {
    return { events: [...events], complete: true };
  }

  const condition = rawCondition.replace(/^\s*\$\{\{|\}\}\s*$/g, "");
  const positive = new Set<string>();
  const negative = new Set<string>();
  const negatedEquality =
    /!\s*\(\s*github\.event_name\s*(?:===|==)\s*(['"])([^'"]+)\1\s*\)/g;
  for (const match of condition.matchAll(negatedEquality)) {
    negative.add(match[2]);
  }
  const withoutNegatedEquality = condition.replace(negatedEquality, "");
  const equality = /github\.event_name\s*(===|==|!==|!=)\s*(['"])([^'"]+)\2/g;
  for (const match of withoutNegatedEquality.matchAll(equality)) {
    if (match[1] === "==" || match[1] === "===") positive.add(match[3]);
    else negative.add(match[3]);
  }

  const fromJson =
    /contains\s*\(\s*fromJSON\s*\(\s*(['"])(.*?)\1\s*\)\s*,\s*github\.event_name\s*\)/gi;
  for (const match of condition.matchAll(fromJson)) {
    try {
      const decoded = JSON.parse(match[2]) as unknown;
      if (Array.isArray(decoded)) {
        for (const value of decoded) {
          if (typeof value === "string") positive.add(value);
        }
      }
    } catch {
      // The completeness flag below reports that narrowing was not understood.
    }
  }

  const recognized = positive.size > 0 || negative.size > 0;
  let reachable =
    positive.size > 0
      ? events.filter((event) => positive.has(event))
      : [...events];
  reachable = reachable.filter((event) => !negative.has(event));

  return {
    events: reachable,
    complete: recognized,
  };
}

function normalizeExplicitPermissions(
  raw: unknown,
  source: EffectivePermissions["source"],
): EffectivePermissions {
  if (raw === "read-all") return { default: "read", scopes: {}, source };
  if (raw === "write-all") return { default: "write", scopes: {}, source };
  if (raw === "none") return { default: "none", scopes: {}, source };
  if (raw === "unknown") return { default: "unknown", scopes: {}, source };
  if (typeof raw === "string") {
    return {
      default: "none",
      scopes: { contents: toPermissionLevel(raw) },
      source,
    };
  }
  if (!isRecord(raw)) {
    return { default: "unknown", scopes: {}, source };
  }

  const scopes: Record<string, PermissionLevel> = {};
  for (const [scope, level] of Object.entries(raw)) {
    scopes[scope] = toPermissionLevel(level);
  }
  // GitHub sets every omitted scope to none once any scope is declared.
  return { default: "none", scopes, source };
}

function intersectPermissions(
  ceiling: EffectivePermissions,
  requested: EffectivePermissions,
): EffectivePermissions {
  const scopes = new Set([
    ...Object.keys(ceiling.scopes),
    ...Object.keys(requested.scopes),
    ...SENSITIVE_WRITE_SCOPES,
  ]);
  const merged: Record<string, PermissionLevel> = {};
  for (const scope of scopes) {
    merged[scope] = lowerPermission(
      permissionLevel(ceiling, scope),
      permissionLevel(requested, scope),
    );
  }
  return { default: "none", scopes: merged, source: "reusable-merge" };
}

function lowerPermission(
  left: PermissionLevel,
  right: PermissionLevel,
): PermissionLevel {
  if (left === "none" || right === "none") return "none";
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "read" || right === "read") return "read";
  return "write";
}

function toPermissionLevel(value: unknown): PermissionLevel {
  if (value === "none" || value === "read" || value === "write") return value;
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
