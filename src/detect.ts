const AI_PATTERNS = [
  /\bclaude\b/i,
  /\bclaude-code\b/i,
  /\bcodex\b/i,
  /\bgemini\b/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bai-agent\b/i,
  /\bagent\b/i,
  /\bmcp\b/i,
  /\bllm\b/i,
  /\bchatgpt\b/i,
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
  return AI_PATTERNS.some((pattern) => pattern.test(value));
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
