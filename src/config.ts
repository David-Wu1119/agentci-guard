import fs from "node:fs/promises";
import path from "node:path";

export type AgentciConfig = {
  /** Rule ids to suppress everywhere, e.g. "agentci/unpinned-ai-action". */
  ignore: string[];
  /** Workflow path globs (relative to scan root) to exclude from reporting. */
  ignorePaths: string[];
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
    } catch {
      continue;
    }
    const parsed = JSON.parse(raw) as Partial<AgentciConfig>;
    return {
      ignore: toStringArray(parsed.ignore),
      ignorePaths: toStringArray(parsed.ignorePaths),
    };
  }
  return EMPTY;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

/**
 * Inline, file-level suppression directives read from raw workflow text:
 *   # agentci-ignore <rule-id> [<rule-id> ...] [-- reason]
 *   # agentci-ignore-all [-- reason]
 *
 * Findings are reported at job/step granularity rather than per line, so
 * suppression is scoped to the whole file. The optional `-- reason` is for
 * humans and is ignored by the parser.
 */
export function parseInlineIgnores(raw: string): {
  all: boolean;
  rules: Set<string>;
} {
  const rules = new Set<string>();
  let all = false;

  for (const line of raw.split("\n")) {
    if (/#\s*agentci-ignore-all\b/i.test(line)) {
      all = true;
      continue;
    }
    const match = /#\s*agentci-ignore\s+([^\n]+)/i.exec(line);
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
