// Precision is the whole game for a workflow linter: cry wolf on ordinary CI
// and it gets uninstalled after the first run. We therefore detect AI coding-
// agent usage only from *specific, load-bearing* signals — known agent actions,
// agent CLI invocations, and provider credentials / model identifiers — and
// never from generic words like "agent", "ai", "node", "codex", or "mcp" that
// legitimately appear in self-hosted runner labels ("build-agent"), user-agent
// headers, action slugs ("datadog/agent-action"), and ordinary tooling.
//
// To add support for a new agent, add a specific pattern here (PRs welcome).
export const AI_AGENT_PATTERNS = [
  // Known AI coding-agent GitHub Actions (matched in `uses:`)
  /anthropics\/claude-code(?:-base)?-action/i,
  /\banthropics\/[\w.-]*claude/i,
  /\baider-ai\/aider\b/i,
  /\bsweepai\//i,
  /(?:all-hands-ai|opendevin)\/(?:openhands|opendevin)/i,
  /\bcontinuedev\//i,
  /\bblock\/goose\b|\bgoose-ai\//i,
  /\bgithub\/copilot[\w-]*agent/i,
  /\bopenai\/codex[\w-]*/i,

  // Agent CLIs / tools (product names specific enough to be low false-positive)
  /\bclaude-code\b/i,
  /@anthropic-ai\/claude-code\b/i,
  /\bclaude\b/i, // CLI binary + product name; rare as a literal token in non-AI CI
  /\baider\b/i,
  /\bchatgpt\b/i,
  /\bcodex\s+(?:exec|run|--)/i, // openai codex CLI (bare "codex" is too generic)
  /\bollama\s+run\b/i,
  /\bcursor-agent\b/i,
  /\bllm\s+(?:-m|--model)\b/i, // simonw llm CLI (bare "llm" is too generic)

  // Provider credentials / endpoints / SDKs / model identifiers
  /\bANTHROPIC_API_KEY\b/i,
  /\bOPENAI_API_KEY\b/i,
  /\bGEMINI_API_KEY\b/i,
  /api\.(?:anthropic|openai)\.com/i,
  /@anthropic-ai\//i,
  /\bclaude-(?:3|4|opus|sonnet|haiku)\b/i,
  /\bgpt-(?:4|4o|5)\b/i,

  // Explicit agent phrasing
  /\bai[ -]agents?\b/i,
  /\bcoding agents?\b/i,
  /\bautonomous agents?\b/i,
  /\bllm[ -]agents?\b/i,
  /\bmodel context protocol\b/i,
];

const UNTRUSTED_CONTEXT_PATTERNS = [
  /github\.event\.pull_request\.(body|title|head\.ref|head\.sha)/i,
  /github\.event\.issue\.(body|title)/i,
  /github\.event\.comment\.body/i,
  /github\.event\.review\.body/i,
  /github\.event\.head_commit\.message/i,
  /github\.head_ref/i,
  /github\.ref_name/i,
];

const SECRET_PATTERNS = [
  /secrets\./i,
  /GITHUB_TOKEN/i,
  /\b[A-Z0-9_]*TOKEN\b/,
  /\b[A-Z0-9_]*KEY\b/,
];
const SHELL_PATTERNS = [
  /\bshell\b/i,
  /\bbash\b/i,
  /\bsh\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bnpx\b/i,
  /\bpython\b/i,
  /\bnode\b/i,
  /\bexec\b/i,
];

export function looksLikeAiUsage(value: string): boolean {
  return AI_AGENT_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsUntrustedGitHubContext(value: string): boolean {
  return UNTRUSTED_CONTEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsSecretReference(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsShellAccess(value: string): boolean {
  return SHELL_PATTERNS.some((pattern) => pattern.test(value));
}

export function isPinnedAction(uses: string): boolean {
  const ref = uses.split("@")[1];
  return Boolean(ref && /^[a-f0-9]{40}$/i.test(ref));
}
