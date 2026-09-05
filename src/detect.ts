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
  // The OpenHands organization renamed from All-Hands-AI and publishes agents
  // under repositories other than `openhands` (extensions, software-agent-sdk),
  // so the org is anchored and the repository left open. Both legacy org names
  // are kept because pinned older references stay valid indefinitely.
  /^openhands\/[\w.-]+/i,
  /(?:all-hands-ai|opendevin)\/[\w.-]*(?:openhands|opendevin|extensions|software-agent-sdk)/i,
  /\bcontinuedev\//i,
  /\bblock\/goose\b|\bgoose-ai\//i,
  /\bgithub\/copilot[\w-]*agent/i,
  /\bopenai\/codex[\w-]*/i,
  // Google's Gemini CLI action and its archived predecessor. Exact repository
  // names, because the google-github-actions organization also publishes
  // auth, setup-gcloud, and deploy actions that are not agents. Its action.yml
  // (upstream main, read 2026-09-05) defaults `github_issue_number` and
  // `github_pr_number` to the triggering event's payload and takes a
  // `settings` JSON that configures MCP servers, so it operates on the event
  // like the other agent actions; it documents no write-access gate.
  /\bgoogle-github-actions\/run-gemini-cli(?=@|\s|$)/i,
  /\bgoogle-gemini\/gemini-cli-action(?=@|\s|$)/i,
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

// Hosted agents are also dispatched straight over HTTP, with no action and no
// local binary: the workflow posts to an agent endpoint that runs a coding
// session with repository access.
//
// Only agent-dispatch routes belong here. A plain inference call --
// chat/completions, messages, generateContent -- is not an agent: injected
// text can corrupt its output, but the call has no tools with which to touch
// the repository, and the threat this project models requires that reach.
// See the misleading-non-agent adversarial case.
//
// A scheme is required so prose, comments, and documentation naming these
// hosts do not become observations.
export const AI_AGENT_API_PATTERNS = [
  /https?:\/\/api\.cursor\.com\/v\d+\/agents\b/i,
  /https?:\/\/api\.devin\.ai\/v\d+\/sessions\b/i,
  /https?:\/\/api\.githubcopilot\.com\/[^\s"']*agents?\b/i,
];

export const AI_AGENT_PATTERNS = [
  ...AI_AGENT_ACTION_PATTERNS,
  ...AI_AGENT_CLI_PATTERNS,
  ...AI_AGENT_API_PATTERNS,
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

/**
 * anthropics/claude-code-action refuses to run for users without repository
 * write access by default (docs/security.md: "The action can only be
 * triggered by users with write access to the repository. This is checked for
 * issue, pull request, comment, and review events"). The lower-level
 * claude-code-base-action performs no such check and is deliberately excluded.
 */
export function isSelfGatingAgentAction(uses: string): boolean {
  return /^anthropics\/claude-code-action(?:@|$)/i.test(uses.trim());
}

/**
 * The default gate is removed by allowlisting non-write users or bots. The
 * docs mark `allowed_non_write_users` "a significant security risk" and note
 * that `allowed_bots` entries are not permission-checked at all, so any
 * non-empty value for either counts as a bypass.
 */
export function hasAgentGateBypass(withBlock: unknown): boolean {
  if (!withBlock || typeof withBlock !== "object") return false;
  for (const key of ["allowed_non_write_users", "allowed_bots"]) {
    const value = (withBlock as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return true;
  }
  return false;
}

/**
 * Events on which the action's docs state the write-access check applies.
 * `discussion`, `discussion_comment`, and `pull_request_target` are not listed;
 * a job reachable on any of those keeps its full severity.
 */
export const SELF_GATED_EVENTS = new Set([
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
]);

export function looksLikeAiUsage(value: string): boolean {
  return AI_AGENT_PATTERNS.some((pattern) => pattern.test(value));
}

export function looksLikeAiAction(value: string): boolean {
  return AI_AGENT_ACTION_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * A shell-driven agent invocation: a local CLI, or an HTTP call to a hosted
 * agent endpoint. Both are grouped here rather than with actions because they
 * receive only what the surrounding script hands them, so untrusted content
 * still has to be interpolated for it to reach the agent.
 */
export function looksLikeAiCli(value: string): boolean {
  return [...AI_AGENT_CLI_PATTERNS, ...AI_AGENT_API_PATTERNS].some((pattern) =>
    pattern.test(value),
  );
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
