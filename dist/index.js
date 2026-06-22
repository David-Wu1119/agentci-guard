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
  /github\.event\.pull_request\.(body|title|head\.ref|head\.sha)/i,
  /github\.event\.issue\.(body|title)/i,
  /github\.event\.comment\.body/i,
  /github\.event\.review\.body/i,
  /github\.event\.head_commit\.message/i,
  /github\.head_ref/i,
  /github\.ref_name/i
];
var SECRET_PATTERNS = [
  /secrets\./i,
  /GITHUB_TOKEN/i,
  /\b[A-Z0-9_]*TOKEN\b/,
  /\b[A-Z0-9_]*KEY\b/
];
var SHELL_PATTERNS = [
  /\bshell\b/i,
  /\bbash\b/i,
  /\bsh\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bnpx\b/i,
  /\bpython\b/i,
  /\bnode\b/i,
  /\bexec\b/i
];
function looksLikeAiUsage(value) {
  return AI_AGENT_PATTERNS.some((pattern) => pattern.test(value));
}
function containsUntrustedGitHubContext(value) {
  return UNTRUSTED_CONTEXT_PATTERNS.some((pattern) => pattern.test(value));
}
function containsSecretReference(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
function containsShellAccess(value) {
  return SHELL_PATTERNS.some((pattern) => pattern.test(value));
}
function isPinnedAction(uses) {
  const ref = uses.split("@")[1];
  return Boolean(ref && /^[a-f0-9]{40}$/i.test(ref));
}

// src/report.ts
import pc from "picocolors";
function renderTextReport(result) {
  const lines = [
    "AgentCI Guard scan",
    `Workflows: ${result.workflow_count}`,
    `Findings: ${result.findings.length}`,
    `Summary: critical=${result.summary.critical} high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low}`,
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
    "",
    ...result.findings.flatMap(renderFindingMarkdown),
    ""
  ].join("\n");
}
function renderFindingMarkdown(finding) {
  return [
    `## ${finding.severity.toUpperCase()} ${finding.rule_id}`,
    "",
    `**File:** ${finding.file}`,
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
    severity: "high",
    why: "Secrets mounted into an AI-agent job can be exfiltrated if untrusted prompt content influences tool use, shell commands, or generated output.",
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
                region: { startLine: 1 }
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
import path from "path";
import fg from "fast-glob";
import YAML from "yaml";
import fs from "fs/promises";
async function scanRepository(root, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const scanRoot = path.resolve(cwd, root);
  const workflows = await loadWorkflowFiles(scanRoot);
  const findings = workflows.flatMap(
    (workflow) => scanWorkflow(workflow, scanRoot)
  );
  return {
    scanned_at: (/* @__PURE__ */ new Date()).toISOString(),
    root: scanRoot,
    workflow_count: workflows.length,
    findings,
    summary: summarize(findings)
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
    const raw = await fs.readFile(file, "utf8");
    try {
      workflows.push({ path: file, raw, document: YAML.parse(raw) });
    } catch (error) {
      workflows.push({
        path: file,
        raw,
        document: {
          __parse_error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
  return workflows;
}
function scanWorkflow(workflow, root) {
  const doc = isRecord(workflow.document) ? workflow.document : {};
  const file = path.relative(root, workflow.path);
  const findings = [];
  if ("__parse_error" in doc) {
    findings.push(
      makeFinding("agentci/untrusted-input-in-prompt", {
        file,
        evidence: `YAML parse error: ${String(doc.__parse_error)}`
      })
    );
    return findings;
  }
  const triggers = normalizeTriggers(doc.on ?? doc["on"]);
  const jobs = isRecord(doc.jobs) ? doc.jobs : {};
  const workflowPermissions = normalizePermissions(doc.permissions);
  const workflowIsUntrusted = triggers.some(isUntrustedTrigger);
  const isPullRequestTarget = triggers.includes("pull_request_target");
  for (const [jobName, rawJob] of Object.entries(jobs)) {
    if (!isRecord(rawJob)) continue;
    const jobPermissions = {
      ...workflowPermissions,
      ...normalizePermissions(rawJob.permissions)
    };
    const jobText = JSON.stringify(rawJob);
    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobUsesAi = looksLikeAiUsage(jobText);
    const jobHasWrite = hasWritePermission(jobPermissions);
    const jobHasSecrets = containsSecretReference(jobText);
    const jobHasUntrusted = containsUntrustedGitHubContext(jobText);
    if (jobUsesAi && isPullRequestTarget) {
      findings.push(
        makeFinding("agentci/pull-request-target-ai", {
          file,
          job: jobName,
          evidence: "on: pull_request_target + AI usage"
        })
      );
    }
    if (jobUsesAi && workflowIsUntrusted && jobHasWrite && jobHasUntrusted) {
      findings.push(
        makeFinding("agentci/untrusted-ai-write-token", {
          file,
          job: jobName,
          evidence: "untrusted trigger + AI usage + write permissions + untrusted GitHub event context"
        })
      );
    }
    if (jobUsesAi && jobHasSecrets) {
      findings.push(
        makeFinding("agentci/ai-with-secrets", {
          file,
          job: jobName,
          evidence: "AI job references secrets or token-like environment variables"
        })
      );
    }
    if (jobUsesAi && jobHasWrite) {
      findings.push(
        makeFinding("agentci/broad-write-permissions", {
          file,
          job: jobName,
          evidence: `permissions: ${JSON.stringify(jobPermissions)}`
        })
      );
    }
    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord(rawStep)) continue;
      const stepName = typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
      const stepText = JSON.stringify(rawStep);
      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const stepRun = typeof rawStep.run === "string" ? rawStep.run : "";
      const stepUsesAi = looksLikeAiUsage(stepText);
      if (stepUsesAi && containsUntrustedGitHubContext(stepText)) {
        findings.push(
          makeFinding("agentci/untrusted-input-in-prompt", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(stepText)
          })
        );
      }
      if (stepUsesAi && (containsShellAccess(stepRun) || containsShellAccess(stepText))) {
        findings.push(
          makeFinding("agentci/ai-shell-access", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(stepText)
          })
        );
      }
      if (stepUsesAi && stepUses && !isPinnedAction(stepUses) && !isLocalAction(stepUses)) {
        findings.push(
          makeFinding("agentci/unpinned-ai-action", {
            file,
            job: jobName,
            step: stepName,
            evidence: `uses: ${stepUses}`
          })
        );
      }
      if (isPullRequestTarget && stepUses.includes("actions/checkout") && stepText.includes("github.event.pull_request.head")) {
        findings.push(
          makeFinding("agentci/unsafe-checkout", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(stepText)
          })
        );
      }
    }
  }
  return dedupe(findings);
}
function hasFindingAtOrAbove(findings, severity) {
  return findings.some(
    (finding) => SEVERITY_ORDER.indexOf(finding.severity) >= SEVERITY_ORDER.indexOf(severity)
  );
}
function makeFinding(ruleId, context) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
  const id = `${ruleId}:${context.file}:${context.job ?? ""}:${context.step ?? ""}`;
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
    evidence: context.evidence
  };
}
function normalizeTriggers(raw) {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw))
    return raw.filter((item) => typeof item === "string");
  if (isRecord(raw)) return Object.keys(raw);
  return [];
}
function isUntrustedTrigger(trigger) {
  return [
    "pull_request",
    "pull_request_target",
    "issue_comment",
    "issues",
    "discussion",
    "discussion_comment",
    "workflow_run"
  ].includes(trigger);
}
function normalizePermissions(raw) {
  if (typeof raw === "string") return { contents: raw };
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry) => typeof entry[1] === "string"
    )
  );
}
function hasWritePermission(permissions) {
  return Object.values(permissions).some((value) => value === "write") || permissions.contents === "write" || permissions["pull-requests"] === "write";
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isLocalAction(uses) {
  return uses.startsWith("./") || uses.startsWith("docker://");
}
function shrink(value) {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}
function dedupe(findings) {
  const seen = /* @__PURE__ */ new Set();
  return findings.filter((finding) => {
    const key = `${finding.rule_id}:${finding.file}:${finding.job ?? ""}:${finding.step ?? ""}`;
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
export {
  AI_AGENT_PATTERNS,
  RULES,
  SEVERITY_ORDER,
  containsSecretReference,
  containsShellAccess,
  containsUntrustedGitHubContext,
  hasFindingAtOrAbove,
  isPinnedAction,
  loadWorkflowFiles,
  looksLikeAiUsage,
  renderMarkdownReport,
  renderTextReport,
  scanRepository,
  scanWorkflow,
  toSarif
};
//# sourceMappingURL=index.js.map