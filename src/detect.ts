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
// npx -y/--yes are supported only for the known Claude Code npm package.
export const AI_AGENT_CLI_PATTERNS = [
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*claude(?=[\s;&|)]|$)/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|uvx)\s+|npx\s+(?:(?:-y|--yes)\s+)*)*@anthropic-ai\/claude-code(?:@[A-Za-z0-9^~][A-Za-z0-9._+^~-]*)?(?=[\s;&|)]|$)/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*(?:python3?\s+-m\s+)?aider(?=[\s;&|)]|$)/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*cursor-agent(?=[\s;&|)]|$)/im,
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
  wholeEvent?: boolean;
}> = [
  {
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.pull_request\.(body|title)(?![A-Za-z0-9_-])/i,
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
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.pull_request\.head\.ref(?![A-Za-z0-9_-])/i,
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
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.issue\.(body|title)(?![A-Za-z0-9_-])/i,
    source: "issue",
    events: ["issues", "issue_comment"],
    parentEvents: ["issue_comment"],
  },
  {
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.discussion\.(body|title)(?![A-Za-z0-9_-])/i,
    source: "discussion",
    events: ["discussion", "discussion_comment"],
    parentEvents: ["discussion_comment"],
  },
  {
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.comment\.body(?![A-Za-z0-9_-])/i,
    source: "comment",
    events: [
      "issue_comment",
      "discussion_comment",
      "pull_request_review_comment",
    ],
  },
  {
    // shortcut: recognize only standalone serialization; nested expressions need result-aware dataflow.
    pattern: /^\s*toJSON\s*\(\s*github\.event\s*\)\s*$/i,
    source: "comment",
    events: ["issue_comment"],
    wholeEvent: true,
  },
  {
    pattern: /^\s*toJSON\s*\(\s*github\.event\s*\)\s*$/i,
    source: "issue",
    events: ["issue_comment"],
    parentEvents: ["issue_comment"],
    wholeEvent: true,
  },
  {
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.review\.body(?![A-Za-z0-9_-])/i,
    source: "review",
    events: ["pull_request_review"],
  },
  {
    pattern:
      /(?:^|[^A-Za-z0-9_.])github\.event\.head_commit\.message(?![A-Za-z0-9_-])/i,
    source: "commit",
    events: ["push"],
  },
  {
    pattern: /(?:^|[^A-Za-z0-9_.])github\.head_ref(?![A-Za-z0-9_-])/i,
    source: "pr_head_ref",
    events: ["pull_request", "pull_request_target"],
  },
  {
    pattern: /(?:^|[^A-Za-z0-9_.])github\.ref_name(?![A-Za-z0-9_-])/i,
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
const SHELL_ARGUMENT_PATTERN = /--dangerously-skip-permissions\b/i;

function argumentsAllowShell(value: string): boolean {
  if (SHELL_ARGUMENT_PATTERN.test(value)) return true;
  const words = shellWords(value);
  for (let index = 0; index < words.length; index++) {
    if (/^--(?:append-system-prompt|system-prompt)$/.test(words[index].text)) {
      index++;
      continue;
    }
    const flag = /^--allowed(?:Tools?|-tools)(?:=(.*))?$/i.exec(
      words[index].text,
    );
    if (!flag) continue;
    const tools = [flag[1] ?? ""];
    while (index + 1 < words.length && !words[index + 1].text.startsWith("-")) {
      tools.push(words[++index].text);
    }
    if (SHELL_TOOL_PATTERN.test(tools.join(" "))) return true;
  }
  return false;
}

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
    aiCliInvocations(value).length > 0 ||
    hasOpaqueAiCliSubstitution(value) ||
    hasOpaqueAiCliShellCommand(value)
  );
}

export function looksLikeAiHttpDispatch(value: string): boolean {
  return (
    aiHttpDispatches(value).length > 0 ||
    hasOpaqueAiHttpSubstitution(value) ||
    hasOpaqueAiHttpShellCommand(value)
  );
}

type ShellWord = { text: string; expandableText: string; raw?: string };
export type AiCliInvocation = {
  command: string;
  expandableCommand: string;
  pipedInput: string;
  opaqueInput: boolean;
  uncertainControlFlow: boolean;
};
type AiHttpDispatch = {
  command: string;
  payload: string;
  expandablePayload: string;
  expandableCommand: string;
  opaquePayload: boolean;
  uncertainControlFlow: boolean;
};

function shellWords(value: string): ShellWord[] {
  const words: ShellWord[] = [];
  let text = "";
  let expandableText = "";
  let quote = "";
  let started = false;
  let escaped = false;
  let wordStart = 0;
  const push = (end: number) => {
    if (started)
      words.push({ text, expandableText, raw: value.slice(wordStart, end) });
    text = "";
    expandableText = "";
    started = false;
  };
  for (let index = 0; index < value.length; index++) {
    if (!started) wordStart = index;
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
      push(index);
      continue;
    } else {
      text += character;
      expandableText += character;
    }
    started = true;
  }
  push(value.length);
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
export function githubExpressionEnd(value: string, start: number): number {
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
function shellCommandSegments(value: string): Array<{
  command: string;
  pipedInput: string;
  separatorBefore: string;
  separatorAfter: string;
}> {
  const script = shellScriptWithoutHeredocBodies(value);
  const segments: Array<{
    command: string;
    pipedInput: string;
    separatorBefore: string;
    separatorAfter: string;
  }> = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let pipeline = "";
  let separatorBefore = "";
  const push = (end: number, separator: string) => {
    const command = script.slice(start, end).trim();
    if (
      !command &&
      separator === "\n" &&
      ["&&", "||", "|", "|&"].includes(separatorBefore)
    ) {
      start = end + 1;
      return;
    }
    if (command || separator === ")")
      segments.push({
        command,
        pipedInput: pipeline,
        separatorBefore,
        separatorAfter: separator,
      });
    pipeline =
      separator === "|" || separator === "|&"
        ? [pipeline, command].filter(Boolean).join("\n")
        : "";
    separatorBefore = separator;
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
    if (
      character === "#" &&
      (index === 0 || /[\s;&|()]/.test(script[index - 1]))
    ) {
      const newline = script.indexOf("\n", index);
      push(index, newline >= 0 ? "\n" : "");
      start = newline >= 0 ? newline + 1 : script.length;
      index = newline >= 0 ? newline : script.length;
      continue;
    }
    // `2>&1` and `&>file` redirections do not introduce command boundaries.
    if (
      character === "&" &&
      (script[index - 1] === ">" || script[index + 1] === ">")
    )
      continue;
    if (character === "(" || character === "\n") {
      const prefix = script
        .slice(Math.max(start, script.lastIndexOf("{", index - 1) + 1), index)
        .trim();
      const declarator =
        /^(?:(?:if|elif|while|until|then|else|do)\s+)?(?:function\s+)?(?:[A-Za-z_]\w*|:)(?:\s*\(\s*\))?$/;
      if (declarator.test(prefix)) {
        if (character === "(") {
          const emptyParameters = /^\(\s*\)/.exec(script.slice(index));
          if (emptyParameters && !/\(\s*\)$/.test(prefix)) {
            index += emptyParameters[0].length - 1;
            continue;
          }
          if (/\(\s*\)$/.test(prefix) || /(?:^|\s)function\s+/.test(prefix))
            continue;
        }
        if (
          character === "\n" &&
          (/\(\s*\)$/.test(prefix) || /(?:^|\s)function\s+/.test(prefix))
        )
          continue;
      }
    }
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

export function hasOpaqueAiShellGrouping(value: string): boolean {
  // shortcut: subshell reachability is not modeled; upgrade after measured misses.
  return shellCommandSegments(value).some(
    (segment) => segment.separatorBefore === "(",
  );
}

type ShellReach = boolean | "unknown";
type ShellFrame = { entered: ShellReach } & (
  | {
      kind: "if";
      matched: ShellReach;
      condition: ShellReach;
      active: ShellReach;
      inCondition: boolean;
    }
  | {
      kind: "loop";
      condition: ShellReach;
      active: ShellReach;
      inCondition: boolean;
      until: boolean;
    }
  | {
      kind: "function";
      name: string;
      active: false;
      inCondition: false;
      end: "}" | ")" | "fi" | "done" | "esac" | "segment";
      depth: number;
    }
  | { kind: "group"; active: true; inCondition: false }
  | { kind: "case"; active: "unknown"; inCondition: false }
);

function shellAnd(left: ShellReach, right: ShellReach): ShellReach {
  if (left === false || right === false) return false;
  return left === "unknown" || right === "unknown" ? "unknown" : true;
}

function shellNot(value: ShellReach): ShellReach {
  return value === "unknown" ? value : !value;
}

function shellOr(left: ShellReach, right: ShellReach): ShellReach {
  return shellNot(shellAnd(shellNot(left), shellNot(right)));
}

function literalShellCondition(
  value: string,
  shadowed: ReadonlySet<string>,
): ShellReach {
  if (shadowed.has(value.replace(/^! /, ""))) return "unknown";
  if (value === "true" || value === ":") return true;
  if (value === "false") return false;
  if (value === "! true") return false;
  if (value === "! false") return true;
  return "unknown";
}

const SHELL_FUNCTION_HEADER =
  /^(?:function\s+([A-Za-z_]\w*|:)(?:\s*\(\s*\))?|([A-Za-z_]\w*|:)\s*\(\s*\))\s*(\{|\(|(?=(?:if|for|select|while|until|case)\b|\[\[))/;

/**
 * Recognize the command position in common literal shell compounds. This is
 * not a full shell parser: unknown branch conditions remain explicitly
 * uncertain, while literal false branches cannot become observed agent calls.
 */
function shellExecutableSegments(value: string): Array<{
  command: string;
  pipedInput: string;
  reach: ShellReach;
  functionBody: boolean;
}> {
  const executable: Array<{
    command: string;
    pipedInput: string;
    reach: ShellReach;
    functionBody: boolean;
  }> = [];
  const frames: ShellFrame[] = [];
  // shortcut: subshell function scope and unset -f are not modeled; upgrade for measured misses.
  const shadowed = new Set<string>();
  const deferredShadows = new Map<string, Set<string>>();
  const deferredCalls = new Map<string, Set<string>>();
  let pendingFunction = "";
  let previousStatus: ShellReach = "unknown";
  let controlTransferSeen = false;
  const reach = () =>
    frames.reduce<ShellReach>(
      (current, frame) =>
        shellAnd(current, shellAnd(frame.entered, frame.active)),
      true,
    );
  const definitionReach = () =>
    frames.reduce<ShellReach>(
      (current, frame) =>
        shellAnd(
          current,
          shellAnd(
            frame.entered,
            frame.kind === "function" ? true : frame.active,
          ),
        ),
      true,
    );
  const closeFunction = (
    end: Extract<ShellFrame, { kind: "function" }>["end"],
  ) => {
    const frame = frames.at(-1);
    if (frame?.kind === "function" && frame.end === end) frames.pop();
  };
  const functionParenthesis = (separator: string) => {
    for (let index = frames.length - 1; index >= 0; index--) {
      const frame = frames[index];
      if (frame.kind !== "function" || frame.end !== ")") continue;
      if (separator === "(") frame.depth++;
      if (separator === ")" && --frame.depth === 0 && frames.at(-1) === frame)
        frames.pop();
      return;
    }
  };
  for (const segment of shellCommandSegments(value)) {
    if (!segment.command && segment.separatorAfter === ")") {
      functionParenthesis(")");
      continue;
    }
    let command =
      pendingFunction &&
      segment.separatorBefore === "\n" &&
      /^(?:\{|\(|if|for|select|while|until|case|\[\[)(?=\s|$)/.test(
        segment.command,
      )
        ? `${pendingFunction} ${segment.command}`
        : segment.command;
    pendingFunction = "";
    let startsCondition = false;
    let negated = false;
    const parent = frames.at(-1);
    const priorStatus: ShellReach = parent?.inCondition
      ? parent.condition
      : previousStatus;
    const gate: ShellReach =
      segment.separatorBefore === "&&"
        ? priorStatus
        : segment.separatorBefore === "||"
          ? shellNot(priorStatus)
          : true;
    while (command) {
      const functionHeader = SHELL_FUNCTION_HEADER.exec(command);
      if (functionHeader) {
        const name = functionHeader[1] ?? functionHeader[2];
        if (shellAnd(definitionReach(), gate) !== false) {
          const enclosing = [...frames]
            .reverse()
            .find((frame) => frame.kind === "function");
          if (enclosing?.kind === "function") {
            const names =
              deferredShadows.get(enclosing.name) ?? new Set<string>();
            names.add(name);
            deferredShadows.set(enclosing.name, names);
          } else shadowed.add(name);
        }
        command = command.slice(functionHeader[0].length).trimStart();
        const body = functionHeader[3] || command.split(/\s/, 1)[0];
        frames.push({
          kind: "function",
          name,
          entered: gate,
          active: false,
          inCondition: false,
          depth: body === "(" ? 1 : 0,
          end:
            body === "{" || body === "("
              ? body === "{"
                ? "}"
                : ")"
              : body === "if"
                ? "fi"
                : body === "case"
                  ? "esac"
                  : body === "[["
                    ? "segment"
                    : "done",
        });
        continue;
      }
      const keyword =
        /^(if|elif|then|else|fi|for|select|while|until|do|done|case|esac|!|\{|\})(?=\s|$)/.exec(
          command,
        )?.[1];
      if (!keyword) break;
      command = command.slice(keyword.length).trimStart();
      const frame = frames.at(-1);
      if (keyword === "case") {
        frames.push({
          kind: "case",
          entered: gate,
          active: "unknown",
          inCondition: false,
        });
        command = "";
        break;
      }
      if (keyword === "esac" && frame?.kind === "case") {
        frames.pop();
        closeFunction("esac");
        command = "";
        break;
      }
      if (keyword === "if") {
        frames.push({
          kind: "if",
          entered: gate,
          matched: false,
          condition: literalShellCondition(command, shadowed),
          active: true,
          inCondition: true,
        });
        startsCondition = true;
        if (command.startsWith("! ")) command = command.slice(2).trimStart();
        if (SHELL_FUNCTION_HEADER.test(command)) continue;
        break;
      }
      if (keyword === "for" || keyword === "select") {
        const list = /^([A-Za-z_]\w*)\s+in\s*(.*)$/.exec(command)?.[2];
        const condition =
          keyword === "select" || list === undefined
            ? "unknown"
            : list === ""
              ? false
              : /[$*?[({]/.test(list)
                ? "unknown"
                : true;
        frames.push({
          kind: "loop",
          entered: gate,
          condition,
          active: true,
          inCondition: false,
          until: false,
        });
        command = "";
        break;
      }
      if (keyword === "while" || keyword === "until") {
        const condition = literalShellCondition(command, shadowed);
        frames.push({
          kind: "loop",
          entered: gate,
          condition,
          active: true,
          inCondition: true,
          until: keyword === "until",
        });
        startsCondition = true;
        if (command.startsWith("! ")) command = command.slice(2).trimStart();
        if (SHELL_FUNCTION_HEADER.test(command)) continue;
        break;
      }
      if (keyword === "then" && frame?.kind === "if") {
        frame.active = shellAnd(shellNot(frame.matched), frame.condition);
        frame.inCondition = false;
        continue;
      }
      if (keyword === "elif" && frame?.kind === "if") {
        frame.matched = shellNot(
          shellAnd(shellNot(frame.matched), shellNot(frame.condition)),
        );
        frame.active = shellNot(frame.matched);
        frame.condition = literalShellCondition(command, shadowed);
        frame.inCondition = true;
        startsCondition = true;
        if (command.startsWith("! ")) command = command.slice(2).trimStart();
        if (SHELL_FUNCTION_HEADER.test(command)) continue;
        break;
      }
      if (keyword === "else" && frame?.kind === "if") {
        frame.active = shellAnd(
          shellNot(frame.matched),
          shellNot(frame.condition),
        );
        frame.inCondition = false;
        continue;
      }
      if (keyword === "do" && frame?.kind === "loop") {
        frame.active = frame.until
          ? shellNot(frame.condition)
          : frame.condition;
        frame.inCondition = false;
        continue;
      }
      if (keyword === "fi" && frame?.kind === "if") {
        frames.pop();
        closeFunction("fi");
        command = "";
        break;
      }
      if (keyword === "done" && frame?.kind === "loop") {
        frames.pop();
        closeFunction("done");
        command = "";
        break;
      }
      if (
        keyword === "}" &&
        ((frame?.kind === "function" && frame.end === "}") ||
          frame?.kind === "group")
      ) {
        frames.pop();
        command = "";
        break;
      }
      if (keyword === "!") {
        negated = !negated;
        continue;
      }
      if (keyword === "{") {
        frames.push({
          kind: "group",
          entered: gate,
          active: true,
          inCondition: false,
        });
        continue;
      }
      command = "";
      break;
    }
    const conditionFrame = frames.at(-1);
    const conditionValue = negated
      ? shellNot(literalShellCondition(command, shadowed))
      : literalShellCondition(command, shadowed);
    const current = shellAnd(
      shellAnd(reach(), gate),
      controlTransferSeen ? "unknown" : true,
    );
    if (
      !startsCondition &&
      conditionFrame?.inCondition &&
      command &&
      (segment.separatorBefore === "&&" ||
        segment.separatorBefore === "||" ||
        segment.separatorBefore === ";" ||
        segment.separatorBefore === "\n" ||
        segment.separatorBefore === "|" ||
        segment.separatorBefore === "|&" ||
        segment.separatorBefore === "&")
    ) {
      conditionFrame.condition = ["|", "|&", "&"].includes(
        segment.separatorBefore,
      )
        ? "unknown"
        : segment.separatorBefore === "&&"
          ? shellAnd(conditionFrame.condition, conditionValue)
          : segment.separatorBefore === "||"
            ? shellOr(conditionFrame.condition, conditionValue)
            : conditionValue;
    }
    const functionBody = frames.some((frame) => frame.kind === "function");
    if (command && (current !== false || functionBody))
      executable.push({
        command,
        pipedInput: segment.pipedInput,
        reach: current,
        functionBody,
      });
    previousStatus = ["|", "|&", "&"].includes(segment.separatorBefore)
      ? "unknown"
      : conditionFrame?.inCondition
        ? conditionFrame.condition
        : command
          ? gate === false
            ? priorStatus
            : gate === "unknown"
              ? "unknown"
              : conditionValue
          : "unknown";
    if (
      /^(?:function\s+(?:[A-Za-z_]\w*|:)(?:\s*\(\s*\))?|(?:[A-Za-z_]\w*|:)\s*\(\s*\))$/.test(
        command,
      )
    )
      pendingFunction = command;
    if (command && (functionBody || current !== false)) {
      const words = shellWords(command);
      let index = 0;
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
      if (!startsCondition && index === 0 && words[0]?.raw === "time") {
        index = words[1]?.raw === "-p" ? 2 : 1;
        while (words[index]?.raw === "!") index++;
      }
      const call = words[index];
      const evalWords = evalLaunchedCommand(words);
      const evalCall = evalWords[0]?.text === "eval";
      const evalScript = evalCall
        ? evalWords
            .slice(1)
            .map((word) => word.text)
            .join(" ")
        : "";
      const simpleEval =
        /^[A-Za-z_]\w*(?:[ \t]+[A-Za-z0-9_./:+-]+)*$/.test(evalScript) &&
        !/^(?:time|eval|command|builtin|exec|source)\b/.test(evalScript);
      const invoked = evalCall
        ? simpleEval
          ? shellWords(evalScript)[0]
          : undefined
        : call;
      // shortcut: unresolved command positions can call any defined function; upgrade when measured precision warrants resolution.
      const opaqueCall =
        /[$`*?{}\[\]]/.test(invoked?.expandableText ?? "") ||
        (evalCall && evalScript !== "" && !simpleEval);
      const calls = opaqueCall ? ["*"] : invoked ? [invoked.text] : [];
      // shortcut: deferred calls ignore definition order; upgrade if labeled precision shows this matters.
      if (functionBody && shellAnd(definitionReach(), gate) !== false) {
        const enclosing = [...frames]
          .reverse()
          .find((frame) => frame.kind === "function");
        if (enclosing?.kind === "function") {
          const names = deferredCalls.get(enclosing.name) ?? new Set<string>();
          for (const name of calls) names.add(name);
          deferredCalls.set(enclosing.name, names);
        }
      } else if (current !== false) {
        const pending = [...calls];
        const seen = new Set<string>();
        while (pending.length) {
          const name = pending.pop()!;
          if (name === "*") {
            pending.push(...deferredShadows.keys(), ...deferredCalls.keys());
            continue;
          }
          if (seen.has(name)) continue;
          seen.add(name);
          for (const nested of deferredShadows.get(name) ?? [])
            shadowed.add(nested);
          pending.push(...(deferredCalls.get(name) ?? []));
        }
      }
    }
    closeFunction("segment");
    functionParenthesis(segment.separatorAfter);
    if (
      !functionBody &&
      /^(?:exit|return|break|continue)(?=\s|$)/.test(command)
    )
      controlTransferSeen = true;
  }
  return executable;
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

function envLaunchedCommand(words: ShellWord[]): {
  commandWords: ShellWord[];
  prefixWords: ShellWord[];
} {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
  while (["sudo", "command", "exec", "time"].includes(words[index]?.text)) {
    const launcher = words[index++].text;
    if (launcher === "time" && words[index]?.text === "-p") index++;
    if (launcher === "command") {
      while (words[index]?.text === "-p") index++;
      if (words[index]?.text === "--") index++;
    }
  }
  if (!["env", "/usr/bin/env"].includes(words[index]?.text)) {
    return {
      commandWords: words.slice(index),
      prefixWords: words.slice(0, index),
    };
  }
  index++;
  // shortcut: model literal env options; extend for -S if a measured miss warrants it.
  while (true) {
    const option = words[index]?.text;
    if (option === "--") {
      index++;
      break;
    }
    if (["-i", "--ignore-environment"].includes(option)) {
      index++;
      continue;
    }
    if (
      ["-u", "--unset"].includes(option) &&
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(words[index + 1]?.text ?? "")
    ) {
      index += 2;
      continue;
    }
    if (/^--unset=[A-Za-z_][A-Za-z0-9_]*$/.test(option ?? "")) {
      index++;
      continue;
    }
    break;
  }
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.text ?? "")) index++;
  if (["exec", "command"].includes(words[index]?.text)) {
    return { commandWords: [], prefixWords: words };
  }
  return {
    commandWords: words.slice(index),
    prefixWords: words.slice(0, index),
  };
}

// shortcut: literal same-shell wrappers only; extend for measured eval misses.
function evalLaunchedCommand(words: ShellWord[]): ShellWord[] {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
  if (index === 0 && words[index]?.raw === "time") {
    index++;
    if (words[index]?.raw === "-p") index++;
    if (words[index]?.raw === "!") index++;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
  }
  while (["builtin", "command"].includes(words[index]?.text ?? "")) {
    const launcher = words[index++].text;
    if (launcher === "command") {
      while (words[index]?.text === "-p") index++;
    }
    if (words[index]?.text === "--") index++;
  }
  return words.slice(index);
}

function isCliHelpCheck(args: ShellWord[], cli: string): boolean {
  let help = false;
  let prompt = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index].text;
    if (argument === "--") {
      prompt ||= index + 1 < args.length;
      break;
    }
    if (/^(?:--help|-h|--version)$/.test(argument)) {
      help = true;
    } else if (
      /^(?:-p|--print|--prompt|--message)(?:=|$)/.test(argument) ||
      (argument === "-m" && /\baider$/.test(cli))
    ) {
      prompt = true;
    } else if (
      /^--(?:allowed-?tools?|disallowed-?tools?)(?:=|$)/i.test(argument)
    ) {
      while (index + 1 < args.length && !args[index + 1].text.startsWith("-"))
        index++;
    } else if (
      /^(?:-m|--(?:model|system-prompt|append-system-prompt|input-format|output-format|permission-mode))(?:=|$)/.test(
        argument,
      )
    ) {
      // These operands configure the CLI; they are not positional prompts.
      if (
        !argument.includes("=") &&
        args[index + 1] &&
        !args[index + 1].text.startsWith("-")
      )
        index++;
    } else if (!argument.startsWith("-")) {
      // Preserve possible prompts after options whose arity is not modeled.
      prompt = true;
    }
  }
  return help && !prompt;
}

/** Direct local CLI commands, excluding sibling commands and shell comments. */
export function aiCliInvocations(value: string): AiCliInvocation[] {
  const invocations: AiCliInvocation[] = [];
  for (const segment of shellExecutableSegments(value)) {
    if (segment.reach === false) continue;
    const words = shellWords(segment.command);
    let commandIndex = 0;
    while (commandIndex < words.length) {
      const raw = words[commandIndex].raw ?? "";
      const redirect = /^(?:\d*>>?|\d*<|&>)(?![<>])/.exec(raw);
      if (!redirect) break;
      commandIndex += raw.length === redirect[0].length ? 2 : 1;
    }
    const afterLeadingRedirections = words
      .slice(commandIndex)
      .map((word) => word.raw ?? word.text)
      .join(" ");
    const redirection = firstUnquotedRedirection(afterLeadingRedirections);
    const command =
      redirection >= 0
        ? afterLeadingRedirections.slice(0, redirection)
        : afterLeadingRedirections;
    const { commandWords, prefixWords } = envLaunchedCommand(
      shellWords(command),
    );
    const executable = commandWords.map((word) => word.text).join(" ");
    const cli = AI_AGENT_CLI_PATTERNS.map((pattern) =>
      pattern.exec(executable),
    ).find((match) => match?.index === 0);
    if (!cli) continue;
    const args = commandWords.slice(shellWords(cli[0]).length);
    if (isCliHelpCheck(args, cli[0])) continue;
    // The shell also accepts arguments *after* a redirect. We intentionally
    // exclude the redirect tail from proven prompt material, but cannot call
    // the command complete without parsing that tail's remaining arguments.
    const opaqueInput =
      commandIndex > 0 ||
      redirection >= 0 ||
      commandWords.some((word) => /\$\(|`/.test(word.text)) ||
      prefixWords.some((word) => /\$/.test(word.expandableText));
    invocations.push({
      command: executable,
      expandableCommand: commandWords
        .map((word) => word.expandableText)
        .join(" "),
      pipedInput: segment.pipedInput,
      opaqueInput,
      uncertainControlFlow: segment.reach === "unknown",
    });
  }
  return invocations;
}

/**
 * A CLI named inside a nested command substitution can execute even when the
 * bounded command splitter cannot attribute its arguments. Do not report it
 * as a proven direct invocation; let the scanner mark analysis incomplete.
 */
function hasOpaqueAiSubstitution(
  value: string,
  matches: (body: string) => boolean,
): boolean {
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
      if (matches(body)) return true;
    }
  }
  return false;
}

export function hasOpaqueAiCliSubstitution(value: string): boolean {
  return hasOpaqueAiSubstitution(
    value,
    (body) =>
      aiCliInvocations(body).length > 0 || hasOpaqueAiCliShellCommand(body),
  );
}

export function hasOpaqueAiHttpSubstitution(value: string): boolean {
  return hasOpaqueAiSubstitution(
    value,
    (body) =>
      aiHttpDispatches(body).length > 0 || hasOpaqueAiHttpShellCommand(body),
  );
}

export function hasOpaqueAiShellFunction(value: string): boolean {
  return shellExecutableSegments(value).some(
    (segment) =>
      segment.functionBody &&
      (aiCliInvocations(segment.command).length > 0 ||
        aiHttpDispatches(segment.command).length > 0 ||
        hasOpaqueAiCliShellCommand(segment.command) ||
        hasOpaqueAiHttpShellCommand(segment.command)),
  );
}

/** Shell-evaluated strings may execute an agent, but their dataflow is opaque. */
function hasOpaqueAiShellCommand(
  value: string,
  matches: (body: string) => boolean,
): boolean {
  // shortcut: common literal shell strings only, extend for measured dynamic misses.
  return shellExecutableSegments(value).some((segment) => {
    if (segment.reach === false) return false;
    const words = shellWords(segment.command);
    const evalWords = evalLaunchedCommand(words);
    if (evalWords[0]?.text === "eval")
      return matches(
        evalWords
          .slice(1)
          .map((word) => word.text)
          .join(" "),
      );
    const { commandWords } = envLaunchedCommand(words);
    if (
      ![
        "sh",
        "bash",
        "/bin/sh",
        "/bin/bash",
        "/usr/bin/sh",
        "/usr/bin/bash",
      ].includes(commandWords[0]?.text ?? "")
    )
      return false;
    const args = commandWords.slice(1);
    const commandIndex = args.findIndex((word) =>
      /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text),
    );
    if (commandIndex >= 0) return matches(args[commandIndex + 1]?.text ?? "");
    const stdinIndex = args.findIndex((word) => word.text.startsWith("<<<"));
    if (
      stdinIndex >= 0 &&
      args.slice(0, stdinIndex).every((word) => word.text.startsWith("-"))
    )
      return matches(
        args[stdinIndex].text.slice(3) || args[stdinIndex + 1]?.text || "",
      );
    if (!args.every((word) => word.text.startsWith("-"))) return false;
    const inputWords = shellWords(segment.pipedInput);
    return (
      ["printf", "echo"].includes(inputWords[0]?.text ?? "") &&
      inputWords.slice(1).some((word) => matches(word.text))
    );
  });
}

export function hasOpaqueAiCliShellCommand(value: string): boolean {
  return hasOpaqueAiShellCommand(
    value,
    (body) => aiCliInvocations(body).length > 0,
  );
}

export function hasOpaqueAiHttpShellCommand(value: string): boolean {
  return hasOpaqueAiShellCommand(
    value,
    (body) => aiHttpDispatches(body).length > 0,
  );
}

export function aiHttpDispatches(value: string): AiHttpDispatch[] {
  // shortcut: direct curl commands only; extend when a measured wrapper miss warrants it.
  const dispatches: AiHttpDispatch[] = [];
  for (const segment of shellExecutableSegments(value)) {
    if (segment.reach === false) continue;
    const [executable, ...words] = envLaunchedCommand(
      shellWords(segment.command),
    ).commandWords;
    if (executable?.text !== "curl") continue;
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
        uncertainControlFlow: segment.reach === "unknown",
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
      // shortcut: only literal property indexes; dynamic keys need expression dataflow.
      const indexed =
        !quoted && value[index] === "["
          ? /^\[\s*'([A-Za-z_][A-Za-z0-9_-]*)'\s*\]/.exec(value.slice(index))
          : null;
      if (indexed) {
        expression += `.${indexed[1]}`;
        index += indexed[0].length - 1;
      } else if (value[index] === "'") {
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
    expression = expression.replace(/\s*\.\s*/g, ".");
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
  wholeEvent: boolean;
}> {
  return matchingGitHubContextPatterns(value).flatMap((candidate) =>
    candidate.events.map((event) => ({
      event,
      source: candidate.source,
      wholeEvent: candidate.wholeEvent ?? false,
    })),
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
      argumentsAllowShell(stringValue(raw))
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
