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

type TriState = boolean | "unknown";
type ExpressionToken = {
  kind:
    | "identifier"
    | "string"
    | "boolean"
    | "operator"
    | "left-paren"
    | "right-paren"
    | "comma";
  value: string;
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
  if (rawCondition === undefined || rawCondition === null) {
    return { events: [...events], complete: true };
  }
  if (rawCondition === true) {
    return { events: [...events], complete: true };
  }
  if (rawCondition === false) {
    return { events: [], complete: true };
  }
  if (typeof rawCondition !== "string") {
    return { events: [...events], complete: false };
  }

  const condition = unwrapExpression(rawCondition);
  if (condition === "true") {
    return { events: [...events], complete: true };
  }
  if (condition === "false") {
    return { events: [], complete: true };
  }
  let complete = true;
  const reachable: string[] = [];
  for (const event of events) {
    const result = evaluateEventCondition(condition, event);
    if (result === "unknown") complete = false;
    if (result !== false) reachable.push(event);
  }
  return {
    events: reachable,
    complete,
  };
}

function evaluateEventCondition(condition: string, event: string): TriState {
  const expanded = replaceEventMembership(condition, event);
  const tokens = tokenizeExpression(expanded);
  if (!tokens) return "unknown";
  const parser = new EventExpressionParser(tokens, event);
  return parser.parse();
}

function replaceEventMembership(condition: string, event: string): string {
  return condition.replace(
    /contains\s*\(\s*fromJSON\s*\(\s*(['"])(.*?)\1\s*\)\s*,\s*github\.event_name\s*\)/gi,
    (original, _quote: string, encoded: string) => {
      try {
        const decoded = JSON.parse(encoded) as unknown;
        if (
          Array.isArray(decoded) &&
          decoded.every((value) => typeof value === "string")
        ) {
          return String(
            decoded.some(
              (value) => value.toLowerCase() === event.toLowerCase(),
            ),
          );
        }
      } catch {
        // The parser returns unknown when the original expression remains.
      }
      return original;
    },
  );
}

function unwrapExpression(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("${{") && trimmed.endsWith("}}")) {
    return trimmed.slice(3, -2).trim();
  }
  return trimmed;
}

function tokenizeExpression(value: string): ExpressionToken[] | null {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    const operator = ["!==", "===", "&&", "||", "!=", "=="].find((item) =>
      value.startsWith(item, index),
    );
    if (operator) {
      tokens.push({ kind: "operator", value: operator });
      index += operator.length;
      continue;
    }
    if (character === "!") {
      tokens.push({ kind: "operator", value: character });
      index++;
      continue;
    }
    if (character === "(") {
      tokens.push({ kind: "left-paren", value: character });
      index++;
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "right-paren", value: character });
      index++;
      continue;
    }
    if (character === ",") {
      tokens.push({ kind: "comma", value: character });
      index++;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let text = "";
      index++;
      let closed = false;
      while (index < value.length) {
        const current = value[index];
        if (current === "\\" && index + 1 < value.length) {
          text += value[index + 1];
          index += 2;
        } else if (current === quote) {
          closed = true;
          index++;
          break;
        } else {
          text += current;
          index++;
        }
      }
      if (!closed) return null;
      tokens.push({ kind: "string", value: text });
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(
      value.slice(index),
    )?.[0];
    if (!identifier) return null;
    tokens.push({
      kind:
        identifier === "true" || identifier === "false"
          ? "boolean"
          : "identifier",
      value: identifier,
    });
    index += identifier.length;
  }
  return tokens;
}

class EventExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: ExpressionToken[],
    private readonly event: string,
  ) {}

  parse(): TriState {
    const result = this.parseOr();
    return this.index === this.tokens.length ? result : "unknown";
  }

  private parseOr(): TriState {
    let result = this.parseAnd();
    while (this.consumeOperator("||")) {
      result = triOr(result, this.parseAnd());
    }
    return result;
  }

  private parseAnd(): TriState {
    let result = this.parseUnary();
    while (this.consumeOperator("&&")) {
      result = triAnd(result, this.parseUnary());
    }
    return result;
  }

  private parseUnary(): TriState {
    if (this.consumeOperator("!")) return triNot(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): TriState {
    const token = this.tokens[this.index];
    if (!token) return "unknown";
    if (token.kind === "left-paren") {
      this.index++;
      const result = this.parseOr();
      if (this.tokens[this.index]?.kind !== "right-paren") return "unknown";
      this.index++;
      return result;
    }
    if (token.kind === "boolean") {
      this.index++;
      return token.value === "true";
    }
    if (
      token.kind === "identifier" &&
      this.tokens[this.index + 1]?.kind === "left-paren"
    ) {
      this.index += 2;
      let depth = 1;
      while (this.index < this.tokens.length && depth > 0) {
        const current = this.tokens[this.index];
        if (current.kind === "left-paren") depth++;
        else if (current.kind === "right-paren") depth--;
        this.index++;
      }
      return "unknown";
    }

    const left = token;
    const operator = this.tokens[this.index + 1];
    const right = this.tokens[this.index + 2];
    if (
      operator?.kind === "operator" &&
      ["==", "===", "!=", "!=="].includes(operator.value) &&
      right
    ) {
      this.index += 3;
      const comparison = compareEventOperands(
        left,
        right,
        operator.value,
        this.event,
      );
      return comparison;
    }

    this.index++;
    return "unknown";
  }

  private consumeOperator(operator: string): boolean {
    const token = this.tokens[this.index];
    if (token?.kind === "operator" && token.value === operator) {
      this.index++;
      return true;
    }
    return false;
  }
}

function compareEventOperands(
  left: ExpressionToken,
  right: ExpressionToken,
  operator: string,
  event: string,
): TriState {
  let expected: string | undefined;
  if (
    left.kind === "identifier" &&
    left.value === "github.event_name" &&
    right.kind === "string"
  ) {
    expected = right.value;
  } else if (
    right.kind === "identifier" &&
    right.value === "github.event_name" &&
    left.kind === "string"
  ) {
    expected = left.value;
  }
  if (expected === undefined) return "unknown";
  // GitHub expression string comparisons ignore case.
  const equal = event.toLowerCase() === expected.toLowerCase();
  return operator === "==" || operator === "===" ? equal : !equal;
}

function triNot(value: TriState): TriState {
  return value === "unknown" ? value : !value;
}

function triAnd(left: TriState, right: TriState): TriState {
  if (left === false || right === false) return false;
  if (left === true && right === true) return true;
  return "unknown";
}

function triOr(left: TriState, right: TriState): TriState {
  if (left === true || right === true) return true;
  if (left === false && right === false) return false;
  return "unknown";
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
