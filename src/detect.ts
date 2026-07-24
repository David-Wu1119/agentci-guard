// Precision is the whole game for a workflow linter: cry wolf on ordinary CI
// and it gets uninstalled after the first run. We therefore detect AI coding-
// agent usage only from *specific, load-bearing* signals — known agent actions
// and executable agent CLI invocations — and never from generic words like
// "agent", "ai", "node", "codex", or "mcp" that
// legitimately appear in self-hosted runner labels ("build-agent"), user-agent
// headers, action slugs ("datadog/agent-action"), provider credentials used by
// non-agent inference, and ordinary tooling.
//
// Changing these signals changes the measured classifier and therefore requires
// a new benchmark version after the v0.1.1 evaluation is frozen.
export const AI_AGENT_ACTION_PATTERNS = [
  /anthropics\/claude-code(?:-base)?-action/i,
  /\banthropics\/[\w.-]*claude/i,
  /\baider-ai\/aider\b/i,
  /\bsweepai\//i,
  /(?:all-hands-ai|opendevin)\/(?:openhands|opendevin)/i,
  /\bcontinuedev\//i,
  /\bblock\/goose\b|\bgoose-ai\//i,
  /\bgithub\/copilot[\w-]*agent/i,
  /\bopenai\/codex[\w-]*/i,
];

// A command boundary is deliberately required. This prevents package names,
// comments, paths, e-mail addresses, and prose from becoming observations.
// Pure installation/help/version checks are not agent executions.
export const AI_AGENT_CLI_PATTERNS = [
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*claude(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*@anthropic-ai\/claude-code(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*(?:python3?\s+-m\s+)?aider(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*cursor-agent(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*codex[ \t]+(?:exec|run)(?:[\s]|$)/im,
];

export const AI_AGENT_PATTERNS = [
  ...AI_AGENT_ACTION_PATTERNS,
  ...AI_AGENT_CLI_PATTERNS,
];

const UNTRUSTED_CONTEXT_PATTERNS: Array<{
  pattern: RegExp;
  events: string[];
}> = [
  {
    pattern: /github\.event\.pull_request\.(body|title|head\.ref)/i,
    events: ["pull_request", "pull_request_target"],
  },
  {
    pattern: /github\.event\.issue\.(body|title)/i,
    events: ["issues", "issue_comment"],
  },
  {
    pattern: /github\.event\.discussion\.(body|title)/i,
    events: ["discussion", "discussion_comment"],
  },
  {
    pattern: /github\.event\.comment\.body/i,
    events: [
      "issue_comment",
      "discussion_comment",
      "pull_request_review_comment",
    ],
  },
  {
    pattern: /github\.event\.review\.body/i,
    events: ["pull_request_review"],
  },
  {
    pattern: /github\.event\.review_comment\.body/i,
    events: ["pull_request_review_comment"],
  },
  {
    pattern: /github\.event\.head_commit\.message/i,
    events: ["push"],
  },
  {
    pattern: /github\.head_ref/i,
    events: ["pull_request", "pull_request_target"],
  },
  {
    pattern: /github\.ref_name/i,
    events: ["*"],
  },
];

const SECRET_PATTERNS = [
  /secrets\.[A-Za-z0-9_]+/i,
  /github\.token/i,
  /\$\{\{\s*(?:env\.)?[A-Z0-9_]*(?:TOKEN|KEY)\s*\}\}/,
];
const SHELL_TOOL_PATTERN = /(?:^|[\s,[("'`])(?:Bash|Shell)(?=$|[\s,(\])}"'`])/i;
const SHELL_ARGUMENT_PATTERN =
  /(?:--allowedTools?\s+[^\n]*(?:Bash|Shell)|--dangerously-skip-permissions)\b/i;

export function looksLikeAiUsage(value: string): boolean {
  return AI_AGENT_PATTERNS.some((pattern) => pattern.test(value));
}

export function looksLikeAiAction(value: string): boolean {
  return AI_AGENT_ACTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function looksLikeAiCli(value: string): boolean {
  return AI_AGENT_CLI_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsUntrustedGitHubContext(value: string): boolean {
  return untrustedGitHubContextEvents(value).length > 0;
}

export function untrustedGitHubContextEvents(value: string): string[] {
  const events = new Set<string>();
  for (const candidate of UNTRUSTED_CONTEXT_PATTERNS) {
    if (candidate.pattern.test(value)) {
      for (const event of candidate.events) events.add(event);
    }
  }
  return [...events];
}

export function containsSecretReference(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsShellAccess(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, raw] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("-", "_");
    if (
      /^(?:allowed_?tools?|tools?)$/.test(normalized) &&
      SHELL_TOOL_PATTERN.test(stringValue(raw))
    ) {
      return true;
    }
    if (
      /^(?:claude_)?args$|^(?:options?|additional_args)$/.test(normalized) &&
      SHELL_ARGUMENT_PATTERN.test(stringValue(raw))
    ) {
      return true;
    }
    if (
      /^(?:dangerously_?skip_?permissions|(?:enable|allow)_?(?:shell|commands?))$/.test(
        normalized,
      ) &&
      literalEnabled(raw)
    ) {
      return true;
    }
  }
  return false;
}

export function isPinnedAction(uses: string): boolean {
  const ref = uses.split("@")[1];
  return Boolean(ref && /^[a-f0-9]{40}$/i.test(ref));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function literalEnabled(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "${{ true }}";
}
