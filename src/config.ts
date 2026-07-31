import fs from "node:fs/promises";
import path from "node:path";
import type { PermissionDefault } from "./types.js";

export type AgentciConfig = {
  /** Rule ids to suppress everywhere, e.g. "agentci/unpinned-ai-action". */
  ignore: string[];
  /** Workflow path globs (relative to scan root) to exclude from reporting. */
  ignorePaths: string[];
  /**
   * Optional repository policy for otherwise-absent workflow permissions.
   * Without this, AgentCI Guard reports the effective permission as unknown.
   */
  defaultPermissions?: PermissionDefault;
};

const EMPTY: AgentciConfig = { ignore: [], ignorePaths: [] };

const CONFIG_FILENAMES = ["agentci.config.json", ".agentcirc.json"];

/** Load config from an explicit path, or by discovery in the scan root. */
export async function loadConfig(
  root: string,
  explicitPath?: string,
): Promise<AgentciConfig> {
  const candidates = explicitPath
    ? [path.resolve(explicitPath)]
    : CONFIG_FILENAMES.map((name) => path.join(root, name));

  for (const file of candidates) {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (explicitPath) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(`Unable to read config file ${file}${detail}`);
      }
      continue;
    }
    const parsed = JSON.parse(raw) as Partial<AgentciConfig>;
    return {
      ignore: toStringArray(parsed.ignore),
      ignorePaths: toStringArray(parsed.ignorePaths),
      defaultPermissions: normalizeDefaultPermissions(
        parsed.defaultPermissions,
      ),
    };
  }
  return EMPTY;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizeDefaultPermissions(
  value: unknown,
): PermissionDefault | undefined {
  if (value === undefined) return undefined;
  if (
    value === "unknown" ||
    value === "none" ||
    value === "read-all" ||
    value === "write-all"
  ) {
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "defaultPermissions must be unknown, none, read-all, write-all, or a permission map.",
    );
  }
  const normalized: Record<string, "none" | "read" | "write"> = {};
  for (const [scope, level] of Object.entries(value)) {
    if (level !== "none" && level !== "read" && level !== "write") {
      throw new Error(
        `defaultPermissions.${scope} must be none, read, or write.`,
      );
    }
    normalized[scope] = level;
  }
  return normalized;
}

/**
 * Standalone top-level, file-level suppression directives:
 *   # agentci-ignore <rule-id> [<rule-id> ...] [-- reason]
 *   # agentci-ignore-all [-- reason]
 *
 * Findings are reported at job/step granularity rather than per line, so
 * suppression is scoped to the whole file. Requiring column-zero YAML comments
 * prevents shell-script comments or quoted prompt text from disabling checks.
 * The optional `-- reason` is for humans and is ignored by the parser.
 */
export function parseInlineIgnores(raw: string): {
  all: boolean;
  rules: Set<string>;
} {
  const rules = new Set<string>();
  let all = false;

  for (const line of raw.split("\n")) {
    if (/^#\s*agentci-ignore-all\b/i.test(line)) {
      all = true;
      continue;
    }
    const match = /^#\s*agentci-ignore\s+([^\n]+)/i.exec(line);
    if (!match) continue;
    const spec = match[1].split("--")[0]; // strip the optional "-- reason"
    for (const id of spec.split(/[\s,]+/)) {
      if (id) rules.add(id);
    }
  }

  return { all, rules };
}

/** Minimal glob match: `*` matches within a path segment, `**` across segments. */
export function matchesPath(glob: string, target: string): boolean {
  const pattern = glob
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${pattern}$`).test(target);
}
