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

/** A condition made solely of status functions and boolean operators. */
const STATUS_ONLY_CONDITION =
  /^[\s()!&|]*(?:(?:always|success|failure|cancelled)\(\s*\)[\s()!&|]*)+$/i;

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
  // Status functions are event-independent: none of them can exclude an
  // event, so a condition built only from them and boolean operators leaves
  // the event set untouched and needs no diagnostic. They are deliberately
  // not substituted with `true` — that would turn `!cancelled()` into `false`
  // and silently empty the event set. Mixed conditions fall through and stay
  // conservative.
  if (STATUS_ONLY_CONDITION.test(condition)) {
    return { events: [...events], complete: true };
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

/**
 * Actor and provenance guards that GitHub evaluates before a job starts.
 *
 * These are the standard mitigations for untrusted-event risk, so a job that
 * is restricted by one of them is not reachable by an untrusted actor even
 * though its trigger appears in {@link UNTRUSTED_EVENTS}. Only guards that
 * GitHub itself resolves are trusted here; anything decided by workflow code
 * at runtime is deliberately excluded, because such a check can run after
 * untrusted content has already been fetched or executed.
 */
const TRUSTED_ACTOR_ATOMS: RegExp[] = [
  // Restricted to the repository owner.
  /^(?:github\.actor|github\.event\.sender\.login|github\.event\.comment\.user\.login|github\.event\.issue\.user\.login)\s*(?:==|===)\s*github\.repository_owner$/i,
  /^github\.repository_owner\s*(?:==|===)\s*(?:github\.actor|github\.event\.sender\.login)$/i,
  // Restricted to pull requests that originate in the base repository.
  /^github\.event\.pull_request\.head\.repo\.full_name\s*(?:==|===)\s*github\.repository$/i,
  /^github\.repository\s*(?:==|===)\s*github\.event\.pull_request\.head\.repo\.full_name$/i,
  // Restricted to non-fork pull requests.
  /^!\s*github\.event\.pull_request\.head\.repo\.fork$/i,
  /^github\.event\.pull_request\.head\.repo\.fork\s*(?:==|===)\s*false$/i,
];

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

const ASSOCIATION_EQUALITY =
  /^github\.event\.(?:comment|issue|pull_request|review)\.author_association\s*(?:==|===)\s*(['"])([A-Za-z_]+)\1$/i;

const ASSOCIATION_MEMBERSHIP =
  /^contains\s*\(\s*fromJSON\s*\(\s*(['"])(.*?)\1\s*\)\s*,\s*github\.event\.(?:comment|issue|pull_request|review)\.author_association\s*\)$/i;

/**
 * Report whether an `if:` condition restricts a job or step to trusted actors.
 *
 * The analysis is an implication check, not an evaluation: a conjunction is
 * trusted when *either* operand is trusted (`A && B` implies `A`), while a
 * disjunction is trusted only when *every* operand is trusted. Everything
 * else, negation included, is treated as untrusted.
 */
export function hasTrustedActorGate(rawCondition: unknown): boolean {
  if (typeof rawCondition !== "string") return false;
  return conditionImpliesTrustedActor(unwrapExpression(rawCondition));
}

function conditionImpliesTrustedActor(condition: string): boolean {
  const trimmed = stripOuterParens(condition.trim());
  if (trimmed.length === 0) return false;

  const disjuncts = splitTopLevel(trimmed, "||");
  if (disjuncts.length > 1) {
    return disjuncts.every((part) => conditionImpliesTrustedActor(part));
  }
  const conjuncts = splitTopLevel(trimmed, "&&");
  if (conjuncts.length > 1) {
    return conjuncts.some((part) => conditionImpliesTrustedActor(part));
  }
  return isTrustedActorAtom(trimmed);
}

function isTrustedActorAtom(atom: string): boolean {
  const normalized = atom.replace(/\s+/g, " ").trim();
  if (TRUSTED_ACTOR_ATOMS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const equality = ASSOCIATION_EQUALITY.exec(normalized);
  if (equality) return TRUSTED_ASSOCIATIONS.has(equality[2].toUpperCase());

  const membership = ASSOCIATION_MEMBERSHIP.exec(normalized);
  if (membership) {
    try {
      const decoded = JSON.parse(membership[2]) as unknown;
      return (
        Array.isArray(decoded) &&
        decoded.length > 0 &&
        decoded.every(
          (value) =>
            typeof value === "string" &&
            TRUSTED_ASSOCIATIONS.has(value.toUpperCase()),
        )
      );
    } catch {
      return false;
    }
  }
  return false;
}

function stripOuterParens(value: string): string {
  let current = value.trim();
  while (
    current.startsWith("(") &&
    current.endsWith(")") &&
    wrapsWholeExpression(current)
  ) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

/** True when the leading parenthesis is closed only by the trailing one. */
function wrapsWholeExpression(value: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") {
      depth--;
      if (depth === 0) return index === value.length - 1;
    }
  }
  return false;
}

/** Split on a boolean operator at parenthesis depth zero, ignoring strings. */
function splitTopLevel(value: string, operator: "&&" | "||"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (depth === 0 && value.startsWith(operator, index)) {
      parts.push(value.slice(start, index));
      index += operator.length - 1;
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}
