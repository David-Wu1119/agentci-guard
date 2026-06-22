import path from "node:path";
import fg from "fast-glob";
import YAML from "yaml";
import {
  containsSecretReference,
  containsShellAccess,
  containsUntrustedGitHubContext,
  isPinnedAction,
  looksLikeAiUsage,
} from "./detect.js";
import { RULES, SEVERITY_ORDER } from "./rules.js";
import { loadConfig, matchesPath, parseInlineIgnores } from "./config.js";
import type {
  Finding,
  ScanOptions,
  ScanResult,
  Severity,
  WorkflowFile,
} from "./types.js";
import fs from "node:fs/promises";

type WorkflowMap = Record<string, unknown>;
type FindingContext = {
  file: string;
  job?: string;
  step?: string;
  evidence: string;
};

export async function scanRepository(
  root: string,
  options: Partial<ScanOptions> = {},
): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const scanRoot = path.resolve(cwd, root);
  const config = await loadConfig(scanRoot, options.configPath);
  const workflows = await loadWorkflowFiles(scanRoot);
  const findings = workflows
    .flatMap((workflow) => scanWorkflow(workflow, scanRoot))
    .filter(
      (finding) =>
        !config.ignore.includes(finding.rule_id) &&
        !config.ignorePaths.some((glob) => matchesPath(glob, finding.file)),
    );
  return {
    scanned_at: new Date().toISOString(),
    root: scanRoot,
    workflow_count: workflows.length,
    findings,
    summary: summarize(findings),
  };
}

export async function loadWorkflowFiles(root: string): Promise<WorkflowFile[]> {
  const entries = await fg([".github/workflows/*.{yml,yaml}"], {
    cwd: root,
    dot: true,
    absolute: true,
  });
  const workflows: WorkflowFile[] = [];
  for (const file of entries.sort()) {
    const raw = await fs.readFile(file, "utf8");
    try {
      workflows.push({ path: file, raw, document: YAML.parse(raw) });
    } catch (error) {
      workflows.push({
        path: file,
        raw,
        document: {
          __parse_error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return workflows;
}

export function scanWorkflow(workflow: WorkflowFile, root: string): Finding[] {
  const doc = isRecord(workflow.document) ? workflow.document : {};
  const file = path.relative(root, workflow.path);
  const findings: Finding[] = [];

  if ("__parse_error" in doc) {
    findings.push(
      makeFinding("agentci/untrusted-input-in-prompt", {
        file,
        evidence: `YAML parse error: ${String(doc.__parse_error)}`,
      }),
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
      ...normalizePermissions(rawJob.permissions),
    };
    const jobText = JSON.stringify(rawJob);
    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobUsesAi = looksLikeAiUsage(jobText);
    const jobHasWrite = hasWritePermission(jobPermissions);
    const jobHasSecrets = containsSecretReference(jobText);
    // Untrusted event content inside an `if:` condition is a guard (e.g.
    // `contains(github.event.comment.body, '@claude')`), not a value that
    // reaches the agent. Only treat it as a sink when it appears elsewhere.
    const jobHasUntrusted = containsUntrustedGitHubContext(
      JSON.stringify(stripGuards(rawJob)),
    );

    if (jobUsesAi && isPullRequestTarget) {
      findings.push(
        makeFinding("agentci/pull-request-target-ai", {
          file,
          job: jobName,
          evidence: "on: pull_request_target + AI usage",
        }),
      );
    }
    if (jobUsesAi && workflowIsUntrusted && jobHasWrite && jobHasUntrusted) {
      findings.push(
        makeFinding("agentci/untrusted-ai-write-token", {
          file,
          job: jobName,
          evidence:
            "untrusted trigger + AI usage + write permissions + untrusted GitHub event context",
        }),
      );
    }
    if (jobUsesAi && jobHasSecrets) {
      findings.push(
        makeFinding("agentci/ai-with-secrets", {
          file,
          job: jobName,
          evidence:
            "AI job references secrets or token-like environment variables",
        }),
      );
    }
    if (jobUsesAi && jobHasWrite) {
      findings.push(
        makeFinding("agentci/broad-write-permissions", {
          file,
          job: jobName,
          evidence: `permissions: ${JSON.stringify(jobPermissions)}`,
        }),
      );
    }

    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord(rawStep)) continue;
      const stepName =
        typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
      const stepText = JSON.stringify(rawStep);
      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const stepRun = typeof rawStep.run === "string" ? rawStep.run : "";
      const stepUsesAi = looksLikeAiUsage(stepText);
      const stepUntrustedText = JSON.stringify(stripGuards(rawStep));

      if (stepUsesAi && containsUntrustedGitHubContext(stepUntrustedText)) {
        findings.push(
          makeFinding("agentci/untrusted-input-in-prompt", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(stepText),
          }),
        );
      }
      if (
        stepUsesAi &&
        (containsShellAccess(stepRun) || containsShellAccess(stepText))
      ) {
        findings.push(
          makeFinding("agentci/ai-shell-access", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(stepText),
          }),
        );
      }
      if (
        stepUsesAi &&
        stepUses &&
        !isPinnedAction(stepUses) &&
        !isLocalAction(stepUses)
      ) {
        findings.push(
          makeFinding("agentci/unpinned-ai-action", {
            file,
            job: jobName,
            step: stepName,
            evidence: `uses: ${stepUses}`,
          }),
        );
      }
      if (
        isPullRequestTarget &&
        stepUses.includes("actions/checkout") &&
        stepText.includes("github.event.pull_request.head")
      ) {
        findings.push(
          makeFinding("agentci/unsafe-checkout", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(stepText),
          }),
        );
      }
    }
  }

  const ignores = parseInlineIgnores(workflow.raw);
  const visible = ignores.all
    ? []
    : findings.filter((finding) => !ignores.rules.has(finding.rule_id));
  return dedupe(visible);
}

export function hasFindingAtOrAbove(
  findings: Finding[],
  severity: Severity,
): boolean {
  return findings.some(
    (finding) =>
      SEVERITY_ORDER.indexOf(finding.severity) >=
      SEVERITY_ORDER.indexOf(severity),
  );
}

function makeFinding(ruleId: string, context: FindingContext): Finding {
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
    evidence: context.evidence,
  };
}

function normalizeTriggers(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw))
    return raw.filter((item): item is string => typeof item === "string");
  if (isRecord(raw)) return Object.keys(raw);
  return [];
}

function isUntrustedTrigger(trigger: string): boolean {
  return [
    "pull_request",
    "pull_request_target",
    "issue_comment",
    "issues",
    "discussion",
    "discussion_comment",
    "workflow_run",
  ].includes(trigger);
}

function normalizePermissions(raw: unknown): Record<string, string> {
  if (typeof raw === "string") return { contents: raw };
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

// Write scopes that actually let an agent alter the repository — code,
// releases, PRs, issues, packages, deployments. Scopes like `id-token`
// (OIDC), `actions`, `checks`, `statuses`, `pages`, and `security-events`
// grant `write` but do not let a prompt-injected agent modify the repo, so
// they must not trip the AI-write-token / broad-write rules.
const SENSITIVE_WRITE_SCOPES = new Set([
  "contents",
  "pull-requests",
  "issues",
  "packages",
  "deployments",
]);

function hasWritePermission(permissions: Record<string, string>): boolean {
  return Object.entries(permissions).some(([scope, level]) => {
    if (level !== "write" && level !== "write-all") return false;
    // `permissions: write-all` normalizes to contents:write-all (all scopes).
    return level === "write-all" || SENSITIVE_WRITE_SCOPES.has(scope);
  });
}

/**
 * Deep-clone a workflow node with every `if:` condition removed. Untrusted
 * event references inside an `if:` are guards, not values that reach the agent.
 */
function stripGuards(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGuards);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === "if") continue;
      out[key] = stripGuards(val);
    }
    return out;
  }
  return value;
}

function isRecord(value: unknown): value is WorkflowMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLocalAction(uses: string): boolean {
  return uses.startsWith("./") || uses.startsWith("docker://");
}

function shrink(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.rule_id}:${finding.file}:${finding.job ?? ""}:${finding.step ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarize(findings: Finding[]): Record<Severity, number> {
  return {
    low: findings.filter((finding) => finding.severity === "low").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    critical: findings.filter((finding) => finding.severity === "critical")
      .length,
  };
}
