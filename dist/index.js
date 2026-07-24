// src/config.ts
import fs from "fs/promises";
import path from "path";
var EMPTY = { ignore: [], ignorePaths: [] };
var CONFIG_FILENAMES = ["agentci.config.json", ".agentcirc.json"];
async function loadConfig(root, explicitPath) {
  const candidates = explicitPath ? [path.resolve(explicitPath)] : CONFIG_FILENAMES.map((name) => path.join(root, name));
  for (const file of candidates) {
    let raw;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (explicitPath) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(`Unable to read config file ${file}${detail}`);
      }
      continue;
    }
    const parsed = JSON.parse(raw);
    return {
      ignore: toStringArray(parsed.ignore),
      ignorePaths: toStringArray(parsed.ignorePaths),
      defaultPermissions: normalizeDefaultPermissions(
        parsed.defaultPermissions
      )
    };
  }
  return EMPTY;
}
function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
function normalizeDefaultPermissions(value) {
  if (value === void 0) return void 0;
  if (value === "unknown" || value === "none" || value === "read-all" || value === "write-all") {
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "defaultPermissions must be unknown, none, read-all, write-all, or a permission map."
    );
  }
  const normalized = {};
  for (const [scope, level] of Object.entries(value)) {
    if (level !== "none" && level !== "read" && level !== "write") {
      throw new Error(
        `defaultPermissions.${scope} must be none, read, or write.`
      );
    }
    normalized[scope] = level;
  }
  return normalized;
}
function parseInlineIgnores(raw) {
  const rules = /* @__PURE__ */ new Set();
  let all = false;
  for (const line of raw.split("\n")) {
    if (/#\s*agentci-ignore-all\b/i.test(line)) {
      all = true;
      continue;
    }
    const match = /#\s*agentci-ignore\s+([^\n]+)/i.exec(line);
    if (!match) continue;
    const spec = match[1].split("--")[0];
    for (const id of spec.split(/[\s,]+/)) {
      if (id) rules.add(id);
    }
  }
  return { all, rules };
}
function matchesPath(glob, target) {
  const pattern = glob.split("**").map(
    (part) => part.split("*").map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")
  ).join(".*");
  return new RegExp(`^${pattern}$`).test(target);
}

// src/detect.ts
var AI_AGENT_PATTERNS = [
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
  /\bclaude\b/i,
  // CLI binary + product name; rare as a literal token in non-AI CI
  /\baider\b/i,
  /\bchatgpt\b/i,
  /\bcodex\s+(?:exec|run|--)/i,
  // openai codex CLI (bare "codex" is too generic)
  /\bollama\s+run\b/i,
  /\bcursor-agent\b/i,
  /\bllm\s+(?:-m|--model)\b/i,
  // simonw llm CLI (bare "llm" is too generic)
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
  /\bmodel context protocol\b/i
];
var UNTRUSTED_CONTEXT_PATTERNS = [
  {
    pattern: /github\.event\.pull_request\.(body|title|head\.ref|head\.sha)/i,
    events: ["pull_request", "pull_request_target"]
  },
  {
    pattern: /github\.event\.issue\.(body|title)/i,
    events: ["issues", "issue_comment"]
  },
  {
    pattern: /github\.event\.discussion\.(body|title)/i,
    events: ["discussion", "discussion_comment"]
  },
  {
    pattern: /github\.event\.comment\.body/i,
    events: [
      "issue_comment",
      "discussion_comment",
      "pull_request_review_comment"
    ]
  },
  {
    pattern: /github\.event\.review\.body/i,
    events: ["pull_request_review"]
  },
  {
    pattern: /github\.event\.review_comment\.body/i,
    events: ["pull_request_review_comment"]
  },
  {
    pattern: /github\.event\.head_commit\.message/i,
    events: ["push"]
  },
  {
    pattern: /github\.head_ref/i,
    events: ["pull_request", "pull_request_target"]
  },
  {
    pattern: /github\.ref_name/i,
    events: ["*"]
  }
];
var SECRET_PATTERNS = [
  /secrets\.[A-Za-z0-9_]+/i,
  /github\.token/i,
  /\$\{\{\s*(?:env\.)?[A-Z0-9_]*(?:TOKEN|KEY)\s*\}\}/
];
var EXPLICIT_SHELL_CAPABILITY_PATTERNS = [
  /--allowedTools?\s+[^\n]*(?:Bash|Shell)/i,
  /allowed[_-]?tools?["']?\s*[:=][^\n]*(?:Bash|Shell)/i,
  /\b(?:Bash|Shell)\s*\([^)]*\)/i,
  /dangerously[_-]?skip[_-]?permissions/i,
  /(?:enable|allow)[_-]?(?:shell|commands?)/i
];
function looksLikeAiUsage(value) {
  return AI_AGENT_PATTERNS.some((pattern) => pattern.test(value));
}
function containsUntrustedGitHubContext(value) {
  return untrustedGitHubContextEvents(value).length > 0;
}
function untrustedGitHubContextEvents(value) {
  const events = /* @__PURE__ */ new Set();
  for (const candidate of UNTRUSTED_CONTEXT_PATTERNS) {
    if (candidate.pattern.test(value)) {
      for (const event of candidate.events) events.add(event);
    }
  }
  return [...events];
}
function containsSecretReference(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
function containsShellAccess(value) {
  return EXPLICIT_SHELL_CAPABILITY_PATTERNS.some(
    (pattern) => pattern.test(value)
  );
}
function isPinnedAction(uses) {
  const ref = uses.split("@")[1];
  return Boolean(ref && /^[a-f0-9]{40}$/i.test(ref));
}

// src/options.ts
function parseFailOn(value) {
  if (value === "none" || value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  throw new Error("fail-on must be one of none, low, medium, high, critical.");
}

// src/report.ts
import pc from "picocolors";
function formatGithubOutputs(result, sarifPath) {
  return [
    `findings=${result.findings.length}`,
    `critical=${result.summary.critical}`,
    `high=${result.summary.high}`,
    `medium=${result.summary.medium}`,
    `low=${result.summary.low}`,
    `sarif-path=${sarifPath ?? ""}`,
    `diagnostics=${result.diagnostics.length}`,
    `analysis-complete=${result.analysis_complete}`
  ].join("\n") + "\n";
}
function renderTextReport(result) {
  const lines = [
    "AgentCI Guard scan",
    `Workflows: ${result.workflow_count}`,
    `Findings: ${result.findings.length}`,
    `Summary: critical=${result.summary.critical} high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low}`,
    `Analysis: ${result.analysis_complete ? "complete" : `partial (${result.diagnostics.length} diagnostic(s))`}`,
    ""
  ];
  for (const finding of result.findings) {
    lines.push(`${label(finding.severity)} ${finding.rule_id}`);
    lines.push(
      `File: ${finding.file}${finding.job ? ` / job: ${finding.job}` : ""}${finding.step ? ` / step: ${finding.step}` : ""}`
    );
    lines.push(`Evidence: ${finding.evidence}`);
    lines.push(`Why: ${finding.why}`);
    lines.push("Fix:");
    for (const fix of finding.fix) lines.push(`- ${fix}`);
    lines.push("");
  }
  if (result.diagnostics.length > 0) {
    lines.push("Diagnostics:");
    for (const diagnostic of result.diagnostics) {
      lines.push(
        `- [${diagnostic.kind.toUpperCase()}] ${diagnostic.code} ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}: ${diagnostic.message}`
      );
    }
  }
  return lines.join("\n");
}
function renderMarkdownReport(result) {
  return [
    "# AgentCI Guard Scan",
    "",
    `- Workflows: ${result.workflow_count}`,
    `- Findings: ${result.findings.length}`,
    `- Critical: ${result.summary.critical}`,
    `- High: ${result.summary.high}`,
    `- Medium: ${result.summary.medium}`,
    `- Low: ${result.summary.low}`,
    `- Analysis complete: ${result.analysis_complete ? "yes" : "no"}`,
    `- Diagnostics: ${result.diagnostics.length}`,
    "",
    ...result.findings.flatMap(renderFindingMarkdown),
    ...result.diagnostics.length > 0 ? [
      "## Diagnostics",
      "",
      ...result.diagnostics.map(
        (diagnostic) => `- **${diagnostic.code}** \u2014 ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}: ${diagnostic.message}`
      ),
      ""
    ] : [],
    ""
  ].join("\n");
}
function renderFindingMarkdown(finding) {
  return [
    `## ${finding.severity.toUpperCase()} ${finding.rule_id}`,
    "",
    `**File:** ${finding.file}`,
    finding.line ? `**Line:** ${finding.line}` : "",
    finding.job ? `**Job:** ${finding.job}` : "",
    finding.step ? `**Step:** ${finding.step}` : "",
    `**Evidence:** \`${finding.evidence.replace(/`/g, "'")}\``,
    "",
    finding.why,
    "",
    "**Fix:**",
    "",
    ...finding.fix.map((fix) => `- ${fix}`),
    ""
  ].filter(Boolean);
}
function label(severity) {
  if (severity === "critical") return pc.red("[CRITICAL]");
  if (severity === "high") return pc.red("[HIGH]");
  if (severity === "medium") return pc.yellow("[MEDIUM]");
  return pc.cyan("[LOW]");
}

// src/rules.ts
var RULES = {
  "agentci/untrusted-ai-write-token": {
    id: "agentci/untrusted-ai-write-token",
    title: "Untrusted event content can reach an AI agent with write permissions",
    severity: "critical",
    why: "An attacker can place prompt-injection text in a PR, issue, or comment. If that text reaches an AI agent with repository write permissions, the agent can be induced to modify code, comments, workflows, or releases.",
    fix: [
      "Do not run privileged AI agents on untrusted triggers.",
      "Use read-only GITHUB_TOKEN permissions for untrusted events.",
      "Require maintainer approval before running the agent.",
      "Sanitize and summarize untrusted content before passing it to an agent."
    ]
  },
  "agentci/pull-request-target-ai": {
    id: "agentci/pull-request-target-ai",
    title: "AI agent runs on pull_request_target",
    severity: "critical",
    why: "pull_request_target runs in the base repository security context and can expose write tokens or secrets to workflows influenced by an untrusted pull request.",
    fix: [
      "Use pull_request with read-only permissions for untrusted code.",
      "Split analysis into a read-only job and a separate maintainer-approved write job.",
      "Avoid checking out untrusted PR head code in pull_request_target."
    ]
  },
  "agentci/ai-with-secrets": {
    id: "agentci/ai-with-secrets",
    title: "AI agent job has access to secrets",
    severity: "medium",
    why: "Secrets mounted into an AI-agent job can be exfiltrated if untrusted prompt content influences tool use, shell commands, or generated output. Most AI actions require a provider key, so this is a baseline exposure to review rather than a vulnerability on its own \u2014 it becomes high-risk when combined with untrusted input or write permissions (see agentci/untrusted-ai-write-token).",
    fix: [
      "Do not expose secrets to agent jobs that process untrusted content.",
      "Use short-lived scoped tokens.",
      "Move secret-bearing actions behind manual approval."
    ]
  },
  "agentci/untrusted-input-in-prompt": {
    id: "agentci/untrusted-input-in-prompt",
    title: "Untrusted GitHub event content is passed into an AI prompt or command",
    severity: "high",
    why: "PR bodies, issue bodies, comments, branch names, and commit messages are attacker-controlled in common workflows and can contain prompt-injection instructions.",
    fix: [
      "Avoid inserting raw GitHub event text into prompts.",
      "Use structured extraction and length limits.",
      "Add prompt-injection filtering before AI execution.",
      "Run the agent with read-only permissions."
    ]
  },
  "agentci/ai-shell-access": {
    id: "agentci/ai-shell-access",
    title: "AI agent has shell or arbitrary command access",
    severity: "high",
    why: "Shell access allows a compromised agent prompt to inspect the workspace, call network endpoints, or alter build artifacts.",
    fix: [
      "Disable shell tools for untrusted events.",
      "Run in a sandbox with no secrets.",
      "Restrict network and filesystem access."
    ]
  },
  "agentci/broad-write-permissions": {
    id: "agentci/broad-write-permissions",
    title: "Workflow grants broad write permissions near AI usage",
    severity: "medium",
    why: "Broad write scopes increase blast radius if an AI-agent step is influenced by untrusted input.",
    fix: [
      "Set default permissions to read-only.",
      "Grant write scopes only in narrowly scoped jobs.",
      "Prefer job-level permissions over workflow-level write permissions."
    ]
  },
  "agentci/unpinned-ai-action": {
    id: "agentci/unpinned-ai-action",
    title: "AI-related action is not pinned to a commit SHA",
    severity: "medium",
    why: "Tag-pinned third-party actions can change over time. AI-agent actions often receive privileged context, so supply-chain drift matters.",
    fix: [
      "Pin third-party actions to full commit SHAs.",
      "Review updates explicitly.",
      "Prefer first-party or internally mirrored actions for privileged jobs."
    ]
  },
  "agentci/unsafe-checkout": {
    id: "agentci/unsafe-checkout",
    title: "Workflow checks out untrusted pull request head in a privileged context",
    severity: "high",
    why: "Checking out attacker-controlled code in a privileged workflow can let malicious build scripts or configuration affect the agent job.",
    fix: [
      "Do not checkout PR head code inside pull_request_target.",
      "Use read-only analysis jobs.",
      "Disable install/build scripts before trust is established."
    ]
  }
};
var SEVERITY_ORDER = ["low", "medium", "high", "critical"];

// src/sarif.ts
function toSarif(findings) {
  const usedRules = Object.values(RULES).filter(
    (rule) => findings.some((finding) => finding.rule_id === rule.id)
  );
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "AgentCI Guard",
            informationUri: "https://github.com/David-Wu1119/agentci-guard",
            rules: usedRules.map((rule) => ({
              id: rule.id,
              name: rule.title,
              shortDescription: { text: rule.title },
              fullDescription: { text: rule.why },
              help: {
                text: rule.fix.join(" "),
                markdown: rule.fix.map((fix) => `- ${fix}`).join("\n")
              },
              defaultConfiguration: { level: sarifLevel(rule.severity) }
            }))
          }
        },
        results: findings.map((finding) => ({
          ruleId: finding.rule_id,
          level: sarifLevel(finding.severity),
          message: { text: `${finding.title}: ${finding.evidence}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: { startLine: finding.line ?? 1 }
              }
            }
          ]
        }))
      }
    ]
  };
}
function sarifLevel(severity) {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}

// src/scanner.ts
import fs2 from "fs/promises";
import path2 from "path";
import fg from "fast-glob";
import YAML from "yaml";

// src/workflow-model.ts
var UNTRUSTED_EVENTS = /* @__PURE__ */ new Set([
  "pull_request",
  "pull_request_target",
  "issue_comment",
  "issues",
  "pull_request_review",
  "pull_request_review_comment",
  "discussion",
  "discussion_comment"
]);
var SENSITIVE_WRITE_SCOPES = /* @__PURE__ */ new Set([
  "contents",
  "pull-requests",
  "issues",
  "discussions",
  "packages",
  "deployments"
]);
function normalizeTriggers(raw) {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((item) => typeof item === "string");
  }
  if (isRecord(raw)) return Object.keys(raw);
  return [];
}
function resolvePermissions(workflowRaw, jobRaw, configuredDefault, ceiling) {
  let effective;
  if (jobRaw !== void 0) {
    effective = normalizeExplicitPermissions(jobRaw, "job");
  } else if (workflowRaw !== void 0) {
    effective = normalizeExplicitPermissions(workflowRaw, "workflow");
  } else if (configuredDefault !== void 0) {
    effective = normalizeExplicitPermissions(
      configuredDefault,
      "configured-default"
    );
  } else {
    effective = {
      default: "unknown",
      scopes: {},
      source: "github-default-unknown"
    };
  }
  return ceiling ? intersectPermissions(ceiling, effective) : effective;
}
function permissionLevel(permissions, scope) {
  return permissions.scopes[scope] ?? permissions.default;
}
function hasSensitiveWrite(permissions) {
  return [...SENSITIVE_WRITE_SCOPES].some(
    (scope) => permissionLevel(permissions, scope) === "write"
  );
}
function hasUnknownSensitivePermission(permissions) {
  return [...SENSITIVE_WRITE_SCOPES].some(
    (scope) => permissionLevel(permissions, scope) === "unknown"
  );
}
function describePermissions(permissions) {
  return JSON.stringify({
    source: permissions.source,
    default: permissions.default,
    scopes: permissions.scopes
  });
}
function mergeEnvironment(...layers) {
  const merged = {};
  for (const layer of layers) {
    if (!isRecord(layer)) continue;
    for (const [key, value] of Object.entries(layer)) {
      merged[key] = typeof value === "string" ? value : JSON.stringify(value ?? "");
    }
  }
  return merged;
}
function narrowEvents(events, rawCondition) {
  if (typeof rawCondition !== "string" || !rawCondition.includes("event_name")) {
    return { events: [...events], complete: true };
  }
  const condition = rawCondition.replace(/^\s*\$\{\{|\}\}\s*$/g, "");
  const positive = /* @__PURE__ */ new Set();
  const negative = /* @__PURE__ */ new Set();
  const negatedEquality = /!\s*\(\s*github\.event_name\s*(?:===|==)\s*(['"])([^'"]+)\1\s*\)/g;
  for (const match of condition.matchAll(negatedEquality)) {
    negative.add(match[2]);
  }
  const withoutNegatedEquality = condition.replace(negatedEquality, "");
  const equality = /github\.event_name\s*(===|==|!==|!=)\s*(['"])([^'"]+)\2/g;
  for (const match of withoutNegatedEquality.matchAll(equality)) {
    if (match[1] === "==" || match[1] === "===") positive.add(match[3]);
    else negative.add(match[3]);
  }
  const fromJson = /contains\s*\(\s*fromJSON\s*\(\s*(['"])(.*?)\1\s*\)\s*,\s*github\.event_name\s*\)/gi;
  for (const match of condition.matchAll(fromJson)) {
    try {
      const decoded = JSON.parse(match[2]);
      if (Array.isArray(decoded)) {
        for (const value of decoded) {
          if (typeof value === "string") positive.add(value);
        }
      }
    } catch {
    }
  }
  const recognized = positive.size > 0 || negative.size > 0;
  let reachable = positive.size > 0 ? events.filter((event) => positive.has(event)) : [...events];
  reachable = reachable.filter((event) => !negative.has(event));
  return {
    events: reachable,
    complete: recognized
  };
}
function normalizeExplicitPermissions(raw, source) {
  if (raw === "read-all") return { default: "read", scopes: {}, source };
  if (raw === "write-all") return { default: "write", scopes: {}, source };
  if (raw === "none") return { default: "none", scopes: {}, source };
  if (raw === "unknown") return { default: "unknown", scopes: {}, source };
  if (typeof raw === "string") {
    return {
      default: "none",
      scopes: { contents: toPermissionLevel(raw) },
      source
    };
  }
  if (!isRecord(raw)) {
    return { default: "unknown", scopes: {}, source };
  }
  const scopes = {};
  for (const [scope, level] of Object.entries(raw)) {
    scopes[scope] = toPermissionLevel(level);
  }
  return { default: "none", scopes, source };
}
function intersectPermissions(ceiling, requested) {
  const scopes = /* @__PURE__ */ new Set([
    ...Object.keys(ceiling.scopes),
    ...Object.keys(requested.scopes),
    ...SENSITIVE_WRITE_SCOPES
  ]);
  const merged = {};
  for (const scope of scopes) {
    merged[scope] = lowerPermission(
      permissionLevel(ceiling, scope),
      permissionLevel(requested, scope)
    );
  }
  return { default: "none", scopes: merged, source: "reusable-merge" };
}
function lowerPermission(left, right) {
  if (left === "none" || right === "none") return "none";
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "read" || right === "read") return "read";
  return "write";
}
function toPermissionLevel(value) {
  if (value === "none" || value === "read" || value === "write") return value;
  return "unknown";
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// src/scanner.ts
var EMPTY_REUSABLE_CONTEXT = {
  inputValues: {},
  inheritedSecrets: false,
  stack: [],
  callChain: []
};
async function scanRepository(root, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const scanRoot = path2.resolve(cwd, root);
  const config = await loadConfig(scanRoot, options.configPath);
  const workflows = await loadWorkflowFiles(scanRoot);
  const repository = {
    root: scanRoot,
    config,
    workflows: new Map(
      workflows.map((workflow) => [path2.resolve(workflow.path), workflow])
    ),
    analyzed: /* @__PURE__ */ new Set()
  };
  const locallyCalled = findLocallyCalledWorkflows(workflows, scanRoot);
  const roots = workflows.filter((workflow) => {
    const triggers = workflowTriggers(workflow);
    return !locallyCalled.has(path2.resolve(workflow.path)) || triggers.some((trigger) => trigger !== "workflow_call");
  });
  const output = { findings: [], diagnostics: [] };
  for (const workflow of roots) {
    mergeOutput(
      output,
      analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT)
    );
  }
  for (const workflow of workflows) {
    const absolute = path2.resolve(workflow.path);
    if (repository.analyzed.has(absolute)) continue;
    const file = relativeFile(scanRoot, workflow.path);
    output.diagnostics.push({
      code: "agentci/analysis-reusable-without-caller",
      kind: "analysis",
      severity: "warning",
      file,
      message: "Reusable workflow was analyzed without a reachable local caller; caller inputs, events, secrets, and token permissions are unknown.",
      line: 1
    });
    mergeOutput(
      output,
      analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT)
    );
  }
  const findings = dedupe(output.findings).filter(
    (finding) => !config.ignore.includes(finding.rule_id) && !config.ignorePaths.some((glob) => matchesPath(glob, finding.file))
  );
  const diagnostics = dedupeDiagnostics(output.diagnostics);
  return {
    scanned_at: (/* @__PURE__ */ new Date()).toISOString(),
    root: scanRoot,
    workflow_count: workflows.length,
    findings,
    summary: summarize(findings),
    diagnostics,
    analysis_complete: diagnostics.length === 0
  };
}
async function loadWorkflowFiles(root) {
  const entries = await fg([".github/workflows/*.{yml,yaml}"], {
    cwd: root,
    dot: true,
    absolute: true
  });
  const workflows = [];
  for (const file of entries.sort()) {
    const raw = await fs2.readFile(file, "utf8");
    const document = YAML.parseDocument(raw, { prettyErrors: true });
    const error = document.errors[0];
    if (error) {
      const line = error.linePos?.[0]?.line;
      workflows.push({
        path: file,
        raw,
        document: void 0,
        parse_error: { message: error.message, line }
      });
    } else {
      workflows.push({ path: file, raw, document: document.toJS() });
    }
  }
  return workflows;
}
function scanWorkflow(workflow, root) {
  const repository = {
    root,
    config: { ignore: [], ignorePaths: [] },
    workflows: /* @__PURE__ */ new Map([[path2.resolve(workflow.path), workflow]]),
    analyzed: /* @__PURE__ */ new Set()
  };
  return analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT).findings;
}
function hasFindingAtOrAbove(findings, severity) {
  return findings.some(
    (finding) => SEVERITY_ORDER.indexOf(finding.severity) >= SEVERITY_ORDER.indexOf(severity)
  );
}
function analyzeWorkflow(workflow, repository, context) {
  const file = relativeFile(repository.root, workflow.path);
  repository.analyzed.add(path2.resolve(workflow.path));
  if (workflow.parse_error) {
    return {
      findings: [],
      diagnostics: [
        {
          code: "agentci/parse-error",
          kind: "parse",
          severity: "error",
          file,
          message: workflow.parse_error.message,
          line: workflow.parse_error.line
        }
      ]
    };
  }
  const doc = isRecord2(workflow.document) ? workflow.document : {};
  const workflowEvents = context.events ?? normalizeTriggers(doc.on ?? doc["on"]);
  const workflowEnvironment = mergeEnvironment(doc.env);
  const workflowPermissions = context.permissionCeiling && doc.permissions === void 0 ? context.permissionCeiling : resolvePermissions(
    doc.permissions,
    void 0,
    repository.config.defaultPermissions,
    context.permissionCeiling
  );
  const jobs = isRecord2(doc.jobs) ? doc.jobs : {};
  const output = { findings: [], diagnostics: [] };
  for (const [jobName, rawJob] of Object.entries(jobs)) {
    if (!isRecord2(rawJob)) continue;
    const jobLine = locateJobLine(workflow.raw, jobName);
    const jobReachability = narrowEvents(workflowEvents, rawJob.if);
    if (!jobReachability.complete) {
      output.diagnostics.push({
        code: "agentci/analysis-event-condition",
        kind: "analysis",
        severity: "warning",
        file,
        job: jobName,
        line: jobLine,
        message: "Could not fully interpret this job's github.event_name condition; event reachability was kept conservative."
      });
    }
    if (jobReachability.events.length === 0) continue;
    const jobPermissions = rawJob.permissions === void 0 ? workflowPermissions : resolvePermissions(
      doc.permissions,
      rawJob.permissions,
      repository.config.defaultPermissions,
      context.permissionCeiling
    );
    if (typeof rawJob.uses === "string") {
      mergeOutput(
        output,
        analyzeReusableCall(
          workflow,
          jobName,
          rawJob,
          jobLine,
          jobReachability.events,
          jobPermissions,
          repository,
          context
        )
      );
      continue;
    }
    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobEnvironment = mergeEnvironment(workflowEnvironment, rawJob.env);
    const aiSteps = [];
    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord2(rawStep)) continue;
      const stepName = typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
      const stepLine = locateStepLine(workflow.raw, jobName, stepName, index);
      const stepReachability = narrowEvents(jobReachability.events, rawStep.if);
      if (!stepReachability.complete) {
        output.diagnostics.push({
          code: "agentci/analysis-event-condition",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          line: stepLine,
          message: "Could not fully interpret this step's github.event_name condition; event reachability was kept conservative."
        });
      }
      if (stepReachability.events.length === 0) continue;
      const effectiveEnvironment = mergeEnvironment(
        jobEnvironment,
        rawStep.env
      );
      const materialized = materializeInputs(
        JSON.stringify({
          name: rawStep.name,
          uses: rawStep.uses,
          run: rawStep.run,
          with: rawStep.with,
          env: effectiveEnvironment
        }),
        context.inputValues
      );
      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const stepRun = typeof rawStep.run === "string" ? rawStep.run : "";
      const stepUsesAi = looksLikeAiUsage(materialized);
      const untrustedEvents = untrustedGitHubContextEvents(
        materializeInputs(
          JSON.stringify(stripGuards(rawStep)),
          context.inputValues
        )
      );
      const hasUntrustedSink = contextCanReach(
        stepReachability.events,
        untrustedEvents
      );
      const hasSecret = context.inheritedSecrets || containsSecretReference(JSON.stringify(effectiveEnvironment)) || containsSecretReference(
        materializeInputs(
          JSON.stringify({
            uses: rawStep.uses,
            run: rawStep.run,
            with: rawStep.with
          }),
          context.inputValues
        )
      );
      if (stepUsesAi) {
        aiSteps.push({
          hasSecret,
          hasUntrustedSink,
          events: stepReachability.events
        });
        if (hasUntrustedSink) {
          output.findings.push(
            makeFinding("agentci/untrusted-input-in-prompt", {
              file,
              job: jobName,
              step: stepName,
              evidence: shrink(materialized),
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain
            })
          );
        }
        if (stepRun.trim().length > 0 || containsShellAccess(JSON.stringify(rawStep.with ?? {}))) {
          output.findings.push(
            makeFinding("agentci/ai-shell-access", {
              file,
              job: jobName,
              step: stepName,
              evidence: stepRun.trim().length > 0 ? `AI CLI executes through run: ${shrink(stepRun)}` : shrink(JSON.stringify(rawStep.with)),
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain
            })
          );
        }
        if (stepUses && !isPinnedAction(stepUses) && !isLocalAction(stepUses)) {
          output.findings.push(
            makeFinding("agentci/unpinned-ai-action", {
              file,
              job: jobName,
              step: stepName,
              evidence: `uses: ${stepUses}`,
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain
            })
          );
        }
      }
      if (stepReachability.events.includes("pull_request_target") && isUnsafeCheckout(rawStep)) {
        output.findings.push(
          makeFinding("agentci/unsafe-checkout", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(JSON.stringify(rawStep)),
            line: stepLine,
            events: stepReachability.events,
            callChain: context.callChain
          })
        );
      }
    }
    if (aiSteps.length === 0) continue;
    const jobHasWrite = hasSensitiveWrite(jobPermissions);
    const aiOnPullRequestTarget = aiSteps.some(
      (step) => step.events.includes("pull_request_target")
    );
    const untrustedAiSink = aiSteps.some(
      (step) => step.hasUntrustedSink && step.events.some((event) => UNTRUSTED_EVENTS.has(event))
    );
    if (aiOnPullRequestTarget) {
      output.findings.push(
        makeFinding("agentci/pull-request-target-ai", {
          file,
          job: jobName,
          evidence: "AI usage is reachable on pull_request_target",
          line: jobLine,
          events: ["pull_request_target"],
          callChain: context.callChain
        })
      );
    }
    if (jobHasWrite && untrustedAiSink) {
      output.findings.push(
        makeFinding("agentci/untrusted-ai-write-token", {
          file,
          job: jobName,
          evidence: "reachable untrusted event content + AI usage + effective write permission",
          line: jobLine,
          events: unionEvents(
            aiSteps.filter((step) => step.hasUntrustedSink).flatMap((step) => step.events)
          ),
          callChain: context.callChain
        })
      );
    }
    if (aiSteps.some((step) => step.hasSecret)) {
      output.findings.push(
        makeFinding("agentci/ai-with-secrets", {
          file,
          job: jobName,
          evidence: "AI step's effective environment or inputs reference a secret/token",
          line: jobLine,
          events: unionEvents(aiSteps.flatMap((step) => step.events)),
          callChain: context.callChain
        })
      );
    }
    if (jobHasWrite) {
      output.findings.push(
        makeFinding("agentci/broad-write-permissions", {
          file,
          job: jobName,
          evidence: `effective permissions: ${describePermissions(jobPermissions)}`,
          line: jobLine,
          events: unionEvents(aiSteps.flatMap((step) => step.events)),
          callChain: context.callChain
        })
      );
    } else if (hasUnknownSensitivePermission(jobPermissions)) {
      output.diagnostics.push({
        code: "agentci/analysis-permissions-unknown",
        kind: "analysis",
        severity: "warning",
        file,
        job: jobName,
        line: jobLine,
        message: "AI job omits explicit permissions and no defaultPermissions policy is configured; write capability is unknown."
      });
    }
  }
  const ignores = parseInlineIgnores(workflow.raw);
  output.findings = ignores.all ? [] : output.findings.filter((finding) => !ignores.rules.has(finding.rule_id));
  return output;
}
function analyzeReusableCall(caller, jobName, rawJob, jobLine, events, permissions, repository, context) {
  const uses = String(rawJob.uses);
  const callerFile = relativeFile(repository.root, caller.path);
  if (!uses.startsWith("./")) {
    return {
      findings: [],
      diagnostics: [
        {
          code: "agentci/analysis-remote-reusable-workflow",
          kind: "analysis",
          severity: "warning",
          file: callerFile,
          job: jobName,
          line: jobLine,
          message: `Remote reusable workflow cannot be resolved statically: ${uses}`
        }
      ]
    };
  }
  const targetPath = path2.resolve(repository.root, uses);
  const target = repository.workflows.get(targetPath);
  if (!target) {
    return {
      findings: [],
      diagnostics: [
        {
          code: "agentci/analysis-local-reusable-missing",
          kind: "analysis",
          severity: "error",
          file: callerFile,
          job: jobName,
          line: jobLine,
          message: `Local reusable workflow was not found: ${uses}`
        }
      ]
    };
  }
  if (context.stack.includes(targetPath)) {
    return {
      findings: [],
      diagnostics: [
        {
          code: "agentci/analysis-reusable-cycle",
          kind: "analysis",
          severity: "warning",
          file: callerFile,
          job: jobName,
          line: jobLine,
          message: `Reusable workflow cycle detected at ${uses}`
        }
      ]
    };
  }
  return analyzeWorkflow(target, repository, {
    events,
    permissionCeiling: permissions,
    inputValues: toStringMap(rawJob.with),
    inheritedSecrets: rawJob.secrets === "inherit" || containsSecretReference(JSON.stringify(rawJob.secrets ?? {})),
    stack: [...context.stack, path2.resolve(caller.path), targetPath],
    callChain: [...context.callChain, `${callerFile}#${jobName}`]
  });
}
function makeFinding(ruleId, context) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
  const chain = context.callChain?.join(">") ?? "";
  const id = `${ruleId}:${context.file}:${context.job ?? ""}:${context.step ?? ""}:${chain}`;
  return {
    id,
    rule_id: rule.id,
    title: rule.title,
    severity: rule.severity,
    file: context.file,
    job: context.job,
    step: context.step,
    message: rule.title,
    why: rule.why,
    fix: rule.fix,
    evidence: context.evidence,
    line: context.line,
    reachable_events: context.events,
    call_chain: context.callChain && context.callChain.length > 0 ? context.callChain : void 0
  };
}
function findLocallyCalledWorkflows(workflows, root) {
  const called = /* @__PURE__ */ new Set();
  for (const workflow of workflows) {
    const doc = isRecord2(workflow.document) ? workflow.document : {};
    const jobs = isRecord2(doc.jobs) ? doc.jobs : {};
    for (const rawJob of Object.values(jobs)) {
      if (isRecord2(rawJob) && typeof rawJob.uses === "string" && rawJob.uses.startsWith("./")) {
        called.add(path2.resolve(root, rawJob.uses));
      }
    }
  }
  return called;
}
function workflowTriggers(workflow) {
  const doc = isRecord2(workflow.document) ? workflow.document : {};
  return normalizeTriggers(doc.on ?? doc["on"]);
}
function contextCanReach(reachableEvents, contextEvents) {
  return contextEvents.includes("*") || contextEvents.some((event) => reachableEvents.includes(event));
}
function isUnsafeCheckout(step) {
  if (typeof step.uses !== "string" || !/^actions\/checkout@/i.test(step.uses)) {
    return false;
  }
  const ref = isRecord2(step.with) ? String(step.with.ref ?? "") : "";
  return /github\.(?:event\.pull_request\.head\.(?:sha|ref)|head_ref)/i.test(
    ref
  );
}
function materializeInputs(value, inputValues) {
  return value.replace(
    /\$\{\{\s*inputs\.([A-Za-z0-9_-]+)\s*\}\}/g,
    (original, name) => inputValues[name] ?? original
  );
}
function toStringMap(value) {
  if (!isRecord2(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : JSON.stringify(item ?? "")
    ])
  );
}
function stripGuards(value) {
  if (Array.isArray(value)) return value.map(stripGuards);
  if (isRecord2(value)) {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === "if") continue;
      out[key] = stripGuards(val);
    }
    return out;
  }
  return value;
}
function locateJobLine(raw, jobName) {
  const lines = raw.split("\n");
  const jobsIndex = lines.findIndex((line) => /^\s*jobs\s*:/.test(line));
  if (jobsIndex < 0) return 1;
  const jobsIndent = indentation(lines[jobsIndex]);
  const matcher = keyMatcher(jobName);
  for (let index = jobsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = indentation(line);
    if (indent <= jobsIndent) break;
    if (matcher.test(line.trim())) return index + 1;
  }
  return jobsIndex + 1;
}
function locateStepLine(raw, jobName, stepName, stepIndex) {
  const lines = raw.split("\n");
  const jobLine = locateJobLine(raw, jobName);
  const jobIndex = Math.max(0, jobLine - 1);
  const jobIndent = indentation(lines[jobIndex] ?? "");
  let stepsIndex = -1;
  let stepsIndent = -1;
  for (let index = jobIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && indentation(line) <= jobIndent) break;
    if (/^\s*steps\s*:/.test(line)) {
      stepsIndex = index;
      stepsIndent = indentation(line);
      break;
    }
  }
  if (stepsIndex < 0) return jobLine;
  const stepStarts = [];
  const quotedName = stripYamlQuotes(stepName);
  let itemIndent;
  for (let index = stepsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && indentation(line) <= stepsIndent) break;
    const match = /^(\s*)-\s+(?:name\s*:\s*)?(.*)$/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    if (itemIndent === void 0) itemIndent = indent;
    if (indent !== itemIndent) continue;
    stepStarts.push(index + 1);
    if (/^\s*-\s+name\s*:/.test(line) && stripYamlQuotes(match[2].trim()) === quotedName) {
      return index + 1;
    }
  }
  return stepStarts[stepIndex] ?? jobLine;
}
function keyMatcher(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')\\s*:`);
}
function stripYamlQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function indentation(line) {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}
function isLocalAction(uses) {
  return uses.startsWith("./") || uses.startsWith("docker://");
}
function relativeFile(root, file) {
  return path2.relative(root, file).split(path2.sep).join("/");
}
function shrink(value) {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}
function unionEvents(events) {
  return [...new Set(events)].sort();
}
function mergeOutput(target, source) {
  target.findings.push(...source.findings);
  target.diagnostics.push(...source.diagnostics);
}
function dedupe(findings) {
  const seen = /* @__PURE__ */ new Set();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}
function dedupeDiagnostics(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.file}:${diagnostic.job ?? ""}:${diagnostic.line ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function summarize(findings) {
  return {
    low: findings.filter((finding) => finding.severity === "low").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    critical: findings.filter((finding) => finding.severity === "critical").length
  };
}
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export {
  AI_AGENT_PATTERNS,
  RULES,
  SENSITIVE_WRITE_SCOPES,
  SEVERITY_ORDER,
  UNTRUSTED_EVENTS,
  containsSecretReference,
  containsShellAccess,
  containsUntrustedGitHubContext,
  describePermissions,
  formatGithubOutputs,
  hasFindingAtOrAbove,
  hasSensitiveWrite,
  hasUnknownSensitivePermission,
  isPinnedAction,
  loadConfig,
  loadWorkflowFiles,
  looksLikeAiUsage,
  matchesPath,
  mergeEnvironment,
  narrowEvents,
  normalizeTriggers,
  parseFailOn,
  parseInlineIgnores,
  permissionLevel,
  renderMarkdownReport,
  renderTextReport,
  resolvePermissions,
  scanRepository,
  scanWorkflow,
  toSarif,
  untrustedGitHubContextEvents
};
//# sourceMappingURL=index.js.map