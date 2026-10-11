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
// Exact documented create routes. A matching URL alone is not an invocation;
// looksLikeAiHttpDispatch also requires a curl POST command.
export const AI_AGENT_API_PATTERNS = [
  /https?:\/\/api\.cursor\.com\/v1\/agents(?:\/[^/\s"'?#]+\/runs)?(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.cursor\.com\/v0\/agents(?:\/[^/\s"'?#]+\/followup)?(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.devin\.ai\/v1\/sessions(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.devin\.ai\/v3\/organizations\/[^/\s"'?#]+\/sessions(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.github\.com\/agents\/repos\/[^/\s"'?#]+\/[^/\s"'?#]+\/tasks(?=$|[\s"'?#\\])/i,
];

export const AI_AGENT_PATTERNS = [
  ...AI_AGENT_ACTION_PATTERNS,
  ...AI_AGENT_CLI_PATTERNS,
];

const UNTRUSTED_CONTEXT_PATTERNS: Array<{
  pattern: RegExp;
  events: string[];
  parentEvents?: string[];
  source:
    | "issue"
    | "pull_request"
    | "pr_head_ref"
    | "discussion"
    | "comment"
    | "review"
    | "commit"
    | "other";
}> = [
  {
    pattern: /github\.event\.pull_request\.(body|title)/i,
    source: "pull_request",
    events: [
      "pull_request",
      "pull_request_target",
      "pull_request_review",
      "pull_request_review_comment",
    ],
    parentEvents: ["pull_request_review", "pull_request_review_comment"],
  },
  {
    pattern: /github\.event\.pull_request\.head\.ref/i,
    source: "pr_head_ref",
    events: [
      "pull_request",
      "pull_request_target",
      "pull_request_review",
      "pull_request_review_comment",
    ],
    parentEvents: ["pull_request_review", "pull_request_review_comment"],
  },
  {
    pattern: /github\.event\.issue\.(body|title)/i,
    source: "issue",
    events: ["issues", "issue_comment"],
    parentEvents: ["issue_comment"],
  },
  {
    pattern: /github\.event\.discussion\.(body|title)/i,
    source: "discussion",
    events: ["discussion", "discussion_comment"],
    parentEvents: ["discussion_comment"],
  },
  {
    pattern: /github\.event\.comment\.body/i,
    source: "comment",
    events: [
      "issue_comment",
      "discussion_comment",
      "pull_request_review_comment",
    ],
  },
  {
    pattern: /github\.event\.review\.body/i,
    source: "review",
    events: ["pull_request_review"],
  },
  {
    pattern: /github\.event\.review_comment\.body/i,
    source: "comment",
    events: ["pull_request_review_comment"],
  },
  {
    pattern: /github\.event\.head_commit\.message/i,
    source: "commit",
    events: ["push"],
  },
  {
    pattern: /github\.head_ref/i,
    source: "pr_head_ref",
    events: ["pull_request", "pull_request_target"],
  },
  {
    pattern: /github\.ref_name/i,
    source: "other",
    events: ["*"],
  },
];

const SECRET_PATTERNS = [
  /secrets\.[A-Za-z0-9_]+/i,
  /\$\{\{[^}]*\bsecrets\s*\[[^\]]+\]/i,
  /\$\{\{[^}]*\btoJSON\s*\(\s*secrets\s*\)/i,
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
 * The default gate is removed by allowlisting non-write users with an explicit
 * token or by allowlisting bots. The latter are not permission-checked.
 */
export function hasAgentGateBypass(withBlock: unknown): boolean {
  if (!withBlock || typeof withBlock !== "object") return false;
  for (const key of ["allowed_non_write_users", "allowed_bots"]) {
    const value = (withBlock as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (
      key === "allowed_non_write_users" &&
      !String((withBlock as Record<string, unknown>).github_token ?? "").trim()
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Events on which the action's docs state the write-access check applies.
 * `discussion`, `discussion_comment`, and `pull_request_target` are not listed;
 * paths that can reach the Action on those events keep full severity. The
 * scanner separately excludes events rejected by a verified pinned revision.
 */
export const SELF_GATED_EVENTS = new Set([
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
]);

export function looksLikeAiUsage(value: string): boolean {
  return (
    looksLikeAiAction(value) ||
    looksLikeAiCli(value) ||
    looksLikeAiHttpDispatch(value)
  );
}

/**
 * A `uses:` reference names its owner first, so every action pattern must
 * match at the start of the reference: `\b` alone accepted
 * `not-google-github-actions/run-gemini-cli`, because a hyphen is a word
 * boundary (found by the 2026-09-09 review). A `docker://` reference is
 * reduced to its `owner/image` first so an agent shipped as a container image
 * keeps matching. Docker's rule for the registry component: the first path
 * segment is a registry when it contains a dot or a colon or is `localhost`
 * (docs.docker.com, image tag reference); v0.6.1 required a dot and dropped
 * `registry:5000` and `localhost` (2026-09-09 follow-up review).
 */
export function looksLikeAiAction(value: string): boolean {
  const reference = value
    .trim()
    .replace(/^docker:\/\/(?:(?:localhost|[^/]*[.:][^/]*)\/)?/i, "");
  return AI_AGENT_ACTION_PATTERNS.some(
    (pattern) => pattern.exec(reference)?.index === 0,
  );
}

/**
 * A local CLI invocation, separate from an HTTP dispatch to a remote agent.
 */
export function looksLikeAiCli(value: string): boolean {
  // A command substitution executes too, but scanner.ts treats its dataflow
  // as opaque rather than claiming a proven direct CLI sink.
  return (
    aiCliInvocations(value).length > 0 || hasOpaqueAiCliSubstitution(value)
  );
}

export function looksLikeAiHttpDispatch(value: string): boolean {
  return aiHttpDispatches(value).length > 0;
}

type ShellWord = { text: string; expandableText: string };
export type AiCliInvocation = {
  command: string;
  expandableCommand: string;
  pipedInput: string;
  opaqueInput: boolean;
};
type AiHttpDispatch = {
  command: string;
  payload: string;
  expandablePayload: string;
  expandableCommand: string;
  opaquePayload: boolean;
};

function shellWords(value: string): ShellWord[] {
  const words: ShellWord[] = [];
  let text = "";
  let expandableText = "";
  let quote = "";
  let started = false;
  let escaped = false;
  const push = () => {
    if (started) words.push({ text, expandableText });
    text = "";
    expandableText = "";
    started = false;
  };
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      text += character;
      if (character !== "$") expandableText += character;
      escaped = false;
    } else if (value.startsWith("${{", index)) {
      // Actions evaluates expressions before invoking the runner shell, even
      // when the expression appears inside shell single quotes. Preserve the
      // full expression so its own quoted punctuation cannot be re-parsed as
      // shell syntax or hide a context field from the source matcher.
      const end = githubExpressionEnd(value, index);
      if (end < 0) {
        text += character;
        if (quote !== "'") expandableText += character;
      } else {
        const expression = value.slice(index, end);
        text += expression;
        expandableText += expression;
        index = end - 1;
      }
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else {
        text += character;
        if (quote !== "'") expandableText += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "#" && !started) {
      break;
    } else if (/\s/.test(character)) {
      push();
      continue;
    } else {
      text += character;
      expandableText += character;
    }
    started = true;
  }
  push();
  return words;
}

function heredocDelimiter(line: string): string {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length - 1; index++) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/.test(line[index - 1]))) break;
    if (line.startsWith("${{", index)) {
      const end = githubExpressionEnd(line, index);
      if (end >= 0) index = end - 1;
      continue;
    }
    if (line.startsWith("<<<", index) || !line.startsWith("<<", index))
      continue;
    const operand = line
      .slice(index + 2)
      .match(
        /^-?\s*(?:'([A-Za-z_][\w-]*)'|"([A-Za-z_][\w-]*)"|([A-Za-z_][\w-]*))/,
      );
    if (operand) return operand[1] ?? operand[2] ?? operand[3];
  }
  return "";
}

function shellScriptWithoutHeredocBodies(value: string): string {
  let heredoc = "";
  return value
    .replace(/\\\r?\n/g, " ")
    .split("\n")
    .filter((line) => {
      if (heredoc) {
        if (line.trim() === heredoc) heredoc = "";
        return false;
      }
      heredoc = heredocDelimiter(line);
      return true;
    })
    .join("\n");
}

/** Find GitHub's closing expression delimiter outside quoted string literals. */
function githubExpressionEnd(value: string, start: number): number {
  let quoted = false;
  for (let index = start + 3; index < value.length; index++) {
    if (value[index] === "'") {
      if (quoted && value[index + 1] === "'") index++;
      else quoted = !quoted;
    } else if (!quoted && value.startsWith("}}", index)) {
      return index + 2;
    }
  }
  return -1;
}

/** Keep nested shell substitutions opaque instead of promoting inner commands. */
function commandSubstitutionEnd(value: string, start: number): number {
  let depth = 1;
  let quote = "";
  let escaped = false;
  for (let index = start + 2; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (value.startsWith("${{", index)) {
      const end = githubExpressionEnd(value, index);
      if (end >= 0) index = end - 1;
      continue;
    }
    if (character === "(") depth++;
    if (character === ")" && --depth === 0) return index + 1;
  }
  return -1;
}

/**
 * Split only the shell constructs needed to associate a directly executed
 * agent CLI with its own arguments. This is not a general shell parser:
 * scanner.ts reports an analysis diagnostic for opaque stdin/variable flow.
 */
function shellCommandSegments(
  value: string,
): Array<{ command: string; pipedInput: string }> {
  const script = shellScriptWithoutHeredocBodies(value);
  const segments: Array<{ command: string; pipedInput: string }> = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let pipeline = "";
  const push = (end: number, separator: string) => {
    const command = script.slice(start, end).trim();
    if (command) segments.push({ command, pipedInput: pipeline });
    pipeline =
      separator === "|" || separator === "|&"
        ? [pipeline, command].filter(Boolean).join("\n")
        : "";
    start = end + separator.length;
  };
  for (let index = 0; index < script.length; index++) {
    const character = script[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    // GitHub expressions are substituted before the shell runs; punctuation
    // inside one is not a shell command separator.
    if (script.startsWith("${{", index)) {
      const end = githubExpressionEnd(script, index);
      if (end >= 0) {
        index = end - 1;
        continue;
      }
    }
    if (script.startsWith("$(", index)) {
      const end = commandSubstitutionEnd(script, index);
      index = end >= 0 ? end - 1 : script.length - 1;
      continue;
    }
    // `2>&1` duplicates a file descriptor; its `&` is not a command boundary.
    if (character === "&" && script[index - 1] === ">") continue;
    if ("\n;&|()".includes(character)) {
      const next = script[index + 1];
      const paired =
        ((character === "&" || character === "|") && next === character) ||
        (character === "|" && next === "&");
      const separator = paired ? character + next : character;
      push(index, separator);
      if (paired) index++;
    }
  }
  push(script.length, "");
  return segments;
}

function firstUnquotedRedirection(command: string): number {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (command.startsWith("${{", index)) {
      const end = githubExpressionEnd(command, index);
      if (end >= 0) {
        index = end - 1;
        continue;
      }
    }
    if (character === "<" || character === ">") return index;
  }
  return -1;
}

/** Direct local CLI commands, excluding sibling commands and shell comments. */
export function aiCliInvocations(value: string): AiCliInvocation[] {
  const invocations: AiCliInvocation[] = [];
  for (const segment of shellCommandSegments(value)) {
    const redirection = firstUnquotedRedirection(segment.command);
    const command =
      redirection >= 0
        ? segment.command.slice(0, redirection)
        : segment.command;
    const words = shellWords(command);
    const executable = words.map((word) => word.text).join(" ");
    if (
      !AI_AGENT_CLI_PATTERNS.some(
        (pattern) => pattern.exec(executable)?.index === 0,
      )
    ) {
      continue;
    }
    // The shell also accepts arguments *after* a redirect. We intentionally
    // exclude the redirect tail from proven prompt material, but cannot call
    // the command complete without parsing that tail's remaining arguments.
    const opaqueInput =
      redirection >= 0 || words.some((word) => /\$\(|`/.test(word.text));
    invocations.push({
      command: words.map((word) => word.text).join(" "),
      expandableCommand: words.map((word) => word.expandableText).join(" "),
      pipedInput: segment.pipedInput,
      opaqueInput,
    });
  }
  return invocations;
}

/**
 * A CLI named inside a nested command substitution can execute even when the
 * bounded command splitter cannot attribute its arguments. Do not report it
 * as a proven direct invocation; let the scanner mark analysis incomplete.
 */
export function hasOpaqueAiCliSubstitution(value: string): boolean {
  const script = shellScriptWithoutHeredocBodies(value);
  let quote = "";
  let escaped = false;
  for (let index = 0; index < script.length - 1; index++) {
    const character = script[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (character === "'" || character === '"') {
      if (!quote) quote = character;
      else if (quote === character) quote = "";
      continue;
    }
    if (quote !== "'" && character === "$" && script[index + 1] === "(") {
      const end = commandSubstitutionEnd(script, index);
      const body = script.slice(index + 2, end >= 0 ? end - 1 : undefined);
      if (AI_AGENT_CLI_PATTERNS.some((pattern) => pattern.test(body)))
        return true;
    }
  }
  return false;
}

export function aiHttpDispatches(value: string): AiHttpDispatch[] {
  // shortcut: direct curl commands only; extend with a shell parser if a
  // measured miss shows dispatch through wrappers or generated scripts.
  const dispatches: AiHttpDispatch[] = [];
  const script = shellScriptWithoutHeredocBodies(value);
  for (const match of script.matchAll(
    /(?:^|[\n;&|()])\s*curl\b([^\n;&|]*)/gim,
  )) {
    const words = shellWords(match[1]);
    let method = "";
    let getOverride = false;
    let hasRoute = false;
    const payloads: ShellWord[] = [];
    for (let index = 0; index < words.length; index++) {
      const word = words[index].text;
      if (word === "-G" || word === "--get") getOverride = true;
      if (word === "-X" || word === "--request") {
        method = words[index + 1]?.text.toUpperCase() ?? "";
        index++;
        continue;
      } else if (word.startsWith("--request=")) {
        method = word.slice("--request=".length).toUpperCase();
        continue;
      } else if (/^-X[A-Za-z]+$/.test(word)) {
        method = word.slice(2).toUpperCase();
        continue;
      }
      if (
        /^(?:-d|-F|--data(?:-raw|-binary|-urlencode)?|--json|--form)$/.test(
          word,
        )
      ) {
        if (words[index + 1]) payloads.push(words[++index]);
        continue;
      }
      const attached =
        /^(?:-d|-F)(.+)$|^--(?:data(?:-raw|-binary|-urlencode)?|json|form)=(.*)$/.exec(
          word,
        );
      if (attached) {
        payloads.push({
          text: attached[1] ?? attached[2],
          expandableText: words[index].expandableText.replace(
            /^(?:-d|-F|--(?:data(?:-raw|-binary|-urlencode)?|json|form)=)/,
            "",
          ),
        });
        continue;
      }
      if (word === "-H" || word === "--header") {
        index++;
        continue;
      }
      if (word === "--url") {
        index++;
      } else if (word.startsWith("-") && !word.startsWith("--url=")) {
        // shortcut: unknown curl options followed by a URL take that URL as
        // an option value; expand the no-value list when a real call is missed.
        if (
          !/^(?:-[sSLfkvi]+|--(?:silent|show-error|location|fail|fail-with-body|insecure|verbose|compressed|include|http1\.1|http2))$/.test(
            word,
          ) &&
          /^https?:\/\//i.test(words[index + 1]?.text ?? "")
        )
          index++;
        continue;
      }
      const candidate = words[index]?.text.replace(/^--url=/, "") ?? "";
      if (
        AI_AGENT_API_PATTERNS.some(
          (pattern) => pattern.exec(candidate)?.index === 0,
        )
      ) {
        hasRoute = true;
      }
    }
    if (
      hasRoute &&
      !getOverride &&
      (method === "POST" || (!method && payloads.length > 0))
    ) {
      dispatches.push({
        command: `curl ${words.map((word) => word.text).join(" ")}`,
        payload: payloads.map((word) => word.text).join(" "),
        expandablePayload: payloads
          .map((word) => word.expandableText)
          .join(" "),
        expandableCommand: words.map((word) => word.expandableText).join(" "),
        opaquePayload: payloads.some((word) => /^@|\$\(|`/.test(word.text)),
      });
    }
  }
  return dispatches;
}

export function containsUntrustedGitHubContext(value: string): boolean {
  return untrustedGitHubContextEvents(value).length > 0;
}

type ContextPattern = (typeof UNTRUSTED_CONTEXT_PATTERNS)[number];

function matchingGitHubContextPatterns(value: string): ContextPattern[] {
  const matches = new Set<ContextPattern>();
  let cursor = 0;
  while (true) {
    const start = value.indexOf("${{", cursor);
    if (start < 0) break;
    let expression = "";
    let quoted = false;
    let end = -1;
    for (let index = start + 3; index < value.length; index++) {
      if (value[index] === "'") {
        if (quoted && value[index + 1] === "'") index++;
        else quoted = !quoted;
      } else if (!quoted && value.startsWith("}}", index)) {
        end = index + 2;
        break;
      } else if (!quoted) {
        expression += value[index];
      }
    }
    if (end < 0) break;
    for (const candidate of UNTRUSTED_CONTEXT_PATTERNS) {
      if (candidate.pattern.test(expression)) matches.add(candidate);
    }
    cursor = end;
  }
  return [...matches];
}

export function untrustedGitHubContextMatches(value: string): Array<{
  event: string;
  source: ContextPattern["source"];
}> {
  return matchingGitHubContextPatterns(value).flatMap((candidate) =>
    candidate.events.map((event) => ({ event, source: candidate.source })),
  );
}

/** With parentOnly, keep only fields whose author can differ from the commenter. */
export function untrustedGitHubContextEvents(
  value: string,
  parentOnly = false,
): string[] {
  const events = new Set<string>();
  for (const candidate of matchingGitHubContextPatterns(value)) {
    for (const event of parentOnly
      ? (candidate.parentEvents ?? [])
      : candidate.events) {
      events.add(event);
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
