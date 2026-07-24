import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import YAML from "yaml";
import { loadConfig, matchesPath, parseInlineIgnores } from "./config.js";
import type { AgentciConfig } from "./config.js";
import {
  containsSecretReference,
  containsShellAccess,
  isPinnedAction,
  looksLikeAiUsage,
  untrustedGitHubContextEvents,
} from "./detect.js";
import { RULES, SEVERITY_ORDER } from "./rules.js";
import type {
  Diagnostic,
  Finding,
  ScanOptions,
  ScanResult,
  Severity,
  WorkflowFile,
} from "./types.js";
import {
  describePermissions,
  hasSensitiveWrite,
  hasUnknownSensitivePermission,
  mergeEnvironment,
  narrowEvents,
  normalizeTriggers,
  resolvePermissions,
  UNTRUSTED_EVENTS,
} from "./workflow-model.js";
import type { EffectivePermissions } from "./workflow-model.js";

type WorkflowMap = Record<string, unknown>;
type FindingContext = {
  file: string;
  job?: string;
  step?: string;
  evidence: string;
  line?: number;
  events?: string[];
  callChain?: string[];
};
type AnalysisOutput = {
  findings: Finding[];
  diagnostics: Diagnostic[];
};
type ReusableContext = {
  events?: string[];
  permissionCeiling?: EffectivePermissions;
  inputValues: Record<string, string>;
  inheritedSecrets: boolean;
  stack: string[];
  callChain: string[];
};
type RepositoryAnalysis = {
  root: string;
  config: AgentciConfig;
  workflows: Map<string, WorkflowFile>;
  analyzed: Set<string>;
};

const EMPTY_REUSABLE_CONTEXT: ReusableContext = {
  inputValues: {},
  inheritedSecrets: false,
  stack: [],
  callChain: [],
};

export async function scanRepository(
  root: string,
  options: Partial<ScanOptions> = {},
): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const scanRoot = path.resolve(cwd, root);
  const config = await loadConfig(scanRoot, options.configPath);
  const workflows = await loadWorkflowFiles(scanRoot);
  const repository: RepositoryAnalysis = {
    root: scanRoot,
    config,
    workflows: new Map(
      workflows.map((workflow) => [path.resolve(workflow.path), workflow]),
    ),
    analyzed: new Set(),
  };

  const locallyCalled = findLocallyCalledWorkflows(workflows, scanRoot);
  const roots = workflows.filter((workflow) => {
    const triggers = workflowTriggers(workflow);
    return (
      !locallyCalled.has(path.resolve(workflow.path)) ||
      triggers.some((trigger) => trigger !== "workflow_call")
    );
  });

  const output: AnalysisOutput = { findings: [], diagnostics: [] };
  for (const workflow of roots) {
    mergeOutput(
      output,
      analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT),
    );
  }

  // A cycle or an unreferenced workflow_call-only file may leave no root.
  // Analyze it once without a caller so it is visible and explicitly partial.
  for (const workflow of workflows) {
    const absolute = path.resolve(workflow.path);
    if (repository.analyzed.has(absolute)) continue;
    const file = relativeFile(scanRoot, workflow.path);
    output.diagnostics.push({
      code: "agentci/analysis-reusable-without-caller",
      kind: "analysis",
      severity: "warning",
      file,
      message:
        "Reusable workflow was analyzed without a reachable local caller; caller inputs, events, secrets, and token permissions are unknown.",
      line: 1,
    });
    mergeOutput(
      output,
      analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT),
    );
  }

  const findings = dedupe(output.findings).filter(
    (finding) =>
      !config.ignore.includes(finding.rule_id) &&
      !config.ignorePaths.some((glob) => matchesPath(glob, finding.file)),
  );
  const diagnostics = dedupeDiagnostics(output.diagnostics);
  return {
    scanned_at: new Date().toISOString(),
    root: scanRoot,
    workflow_count: workflows.length,
    findings,
    summary: summarize(findings),
    diagnostics,
    analysis_complete: diagnostics.length === 0,
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
    const document = YAML.parseDocument(raw, { prettyErrors: true });
    const error = document.errors[0];
    if (error) {
      const line = error.linePos?.[0]?.line;
      workflows.push({
        path: file,
        raw,
        document: undefined,
        parse_error: { message: error.message, line },
      });
    } else {
      workflows.push({ path: file, raw, document: document.toJS() });
    }
  }
  return workflows;
}

/**
 * Scan one already-parsed workflow. Reusable calls cannot be resolved through
 * this compatibility API; repository scans should use scanRepository.
 */
export function scanWorkflow(workflow: WorkflowFile, root: string): Finding[] {
  const repository: RepositoryAnalysis = {
    root,
    config: { ignore: [], ignorePaths: [] },
    workflows: new Map([[path.resolve(workflow.path), workflow]]),
    analyzed: new Set(),
  };
  return analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT).findings;
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

function analyzeWorkflow(
  workflow: WorkflowFile,
  repository: RepositoryAnalysis,
  context: ReusableContext,
): AnalysisOutput {
  const file = relativeFile(repository.root, workflow.path);
  repository.analyzed.add(path.resolve(workflow.path));
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
          line: workflow.parse_error.line,
        },
      ],
    };
  }

  const doc = isRecord(workflow.document) ? workflow.document : {};
  const workflowEvents =
    context.events ?? normalizeTriggers(doc.on ?? doc["on"]);
  const workflowEnvironment = mergeEnvironment(doc.env);
  const workflowPermissions =
    context.permissionCeiling && doc.permissions === undefined
      ? context.permissionCeiling
      : resolvePermissions(
          doc.permissions,
          undefined,
          repository.config.defaultPermissions,
          context.permissionCeiling,
        );
  const jobs = isRecord(doc.jobs) ? doc.jobs : {};
  const output: AnalysisOutput = { findings: [], diagnostics: [] };

  for (const [jobName, rawJob] of Object.entries(jobs)) {
    if (!isRecord(rawJob)) continue;
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
        message:
          "Could not fully interpret this job's github.event_name condition; event reachability was kept conservative.",
      });
    }
    if (jobReachability.events.length === 0) continue;

    const jobPermissions =
      rawJob.permissions === undefined
        ? workflowPermissions
        : resolvePermissions(
            doc.permissions,
            rawJob.permissions,
            repository.config.defaultPermissions,
            context.permissionCeiling,
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
          context,
        ),
      );
      continue;
    }

    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobEnvironment = mergeEnvironment(workflowEnvironment, rawJob.env);
    const aiSteps: Array<{
      hasSecret: boolean;
      hasUntrustedSink: boolean;
      events: string[];
    }> = [];

    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord(rawStep)) continue;
      const stepName =
        typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
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
          message:
            "Could not fully interpret this step's github.event_name condition; event reachability was kept conservative.",
        });
      }
      if (stepReachability.events.length === 0) continue;

      const effectiveEnvironment = mergeEnvironment(
        jobEnvironment,
        rawStep.env,
      );
      const materialized = materializeInputs(
        JSON.stringify({
          name: rawStep.name,
          uses: rawStep.uses,
          run: rawStep.run,
          with: rawStep.with,
          env: effectiveEnvironment,
        }),
        context.inputValues,
      );
      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const stepRun = typeof rawStep.run === "string" ? rawStep.run : "";
      const stepUsesAi = looksLikeAiUsage(materialized);
      const untrustedEvents = untrustedGitHubContextEvents(
        materializeInputs(
          JSON.stringify(stripGuards(rawStep)),
          context.inputValues,
        ),
      );
      const hasUntrustedSink = contextCanReach(
        stepReachability.events,
        untrustedEvents,
      );
      const hasSecret =
        context.inheritedSecrets ||
        containsSecretReference(JSON.stringify(effectiveEnvironment)) ||
        containsSecretReference(
          materializeInputs(
            JSON.stringify({
              uses: rawStep.uses,
              run: rawStep.run,
              with: rawStep.with,
            }),
            context.inputValues,
          ),
        );

      if (stepUsesAi) {
        aiSteps.push({
          hasSecret,
          hasUntrustedSink,
          events: stepReachability.events,
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
              callChain: context.callChain,
            }),
          );
        }
        if (
          stepRun.trim().length > 0 ||
          containsShellAccess(JSON.stringify(rawStep.with ?? {}))
        ) {
          output.findings.push(
            makeFinding("agentci/ai-shell-access", {
              file,
              job: jobName,
              step: stepName,
              evidence:
                stepRun.trim().length > 0
                  ? `AI CLI executes through run: ${shrink(stepRun)}`
                  : shrink(JSON.stringify(rawStep.with)),
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain,
            }),
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
              callChain: context.callChain,
            }),
          );
        }
      }

      if (
        stepReachability.events.includes("pull_request_target") &&
        isUnsafeCheckout(rawStep)
      ) {
        output.findings.push(
          makeFinding("agentci/unsafe-checkout", {
            file,
            job: jobName,
            step: stepName,
            evidence: shrink(JSON.stringify(rawStep)),
            line: stepLine,
            events: stepReachability.events,
            callChain: context.callChain,
          }),
        );
      }
    }

    if (aiSteps.length === 0) continue;
    const jobHasWrite = hasSensitiveWrite(jobPermissions);
    const aiOnPullRequestTarget = aiSteps.some((step) =>
      step.events.includes("pull_request_target"),
    );
    const untrustedAiSink = aiSteps.some(
      (step) =>
        step.hasUntrustedSink &&
        step.events.some((event) => UNTRUSTED_EVENTS.has(event)),
    );

    if (aiOnPullRequestTarget) {
      output.findings.push(
        makeFinding("agentci/pull-request-target-ai", {
          file,
          job: jobName,
          evidence: "AI usage is reachable on pull_request_target",
          line: jobLine,
          events: ["pull_request_target"],
          callChain: context.callChain,
        }),
      );
    }
    if (jobHasWrite && untrustedAiSink) {
      output.findings.push(
        makeFinding("agentci/untrusted-ai-write-token", {
          file,
          job: jobName,
          evidence:
            "reachable untrusted event content + AI usage + effective write permission",
          line: jobLine,
          events: unionEvents(
            aiSteps
              .filter((step) => step.hasUntrustedSink)
              .flatMap((step) => step.events),
          ),
          callChain: context.callChain,
        }),
      );
    }
    if (aiSteps.some((step) => step.hasSecret)) {
      output.findings.push(
        makeFinding("agentci/ai-with-secrets", {
          file,
          job: jobName,
          evidence:
            "AI step's effective environment or inputs reference a secret/token",
          line: jobLine,
          events: unionEvents(aiSteps.flatMap((step) => step.events)),
          callChain: context.callChain,
        }),
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
          callChain: context.callChain,
        }),
      );
    } else if (hasUnknownSensitivePermission(jobPermissions)) {
      output.diagnostics.push({
        code: "agentci/analysis-permissions-unknown",
        kind: "analysis",
        severity: "warning",
        file,
        job: jobName,
        line: jobLine,
        message:
          "AI job omits explicit permissions and no defaultPermissions policy is configured; write capability is unknown.",
      });
    }
  }

  const ignores = parseInlineIgnores(workflow.raw);
  output.findings = ignores.all
    ? []
    : output.findings.filter((finding) => !ignores.rules.has(finding.rule_id));
  return output;
}

function analyzeReusableCall(
  caller: WorkflowFile,
  jobName: string,
  rawJob: WorkflowMap,
  jobLine: number,
  events: string[],
  permissions: EffectivePermissions,
  repository: RepositoryAnalysis,
  context: ReusableContext,
): AnalysisOutput {
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
          message: `Remote reusable workflow cannot be resolved statically: ${uses}`,
        },
      ],
    };
  }

  const targetPath = path.resolve(repository.root, uses);
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
          message: `Local reusable workflow was not found: ${uses}`,
        },
      ],
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
          message: `Reusable workflow cycle detected at ${uses}`,
        },
      ],
    };
  }

  return analyzeWorkflow(target, repository, {
    events,
    permissionCeiling: permissions,
    inputValues: toStringMap(rawJob.with),
    inheritedSecrets:
      rawJob.secrets === "inherit" ||
      containsSecretReference(JSON.stringify(rawJob.secrets ?? {})),
    stack: [...context.stack, path.resolve(caller.path), targetPath],
    callChain: [...context.callChain, `${callerFile}#${jobName}`],
  });
}

function makeFinding(ruleId: string, context: FindingContext): Finding {
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
    call_chain:
      context.callChain && context.callChain.length > 0
        ? context.callChain
        : undefined,
  };
}

function findLocallyCalledWorkflows(
  workflows: WorkflowFile[],
  root: string,
): Set<string> {
  const called = new Set<string>();
  for (const workflow of workflows) {
    const doc = isRecord(workflow.document) ? workflow.document : {};
    const jobs = isRecord(doc.jobs) ? doc.jobs : {};
    for (const rawJob of Object.values(jobs)) {
      if (
        isRecord(rawJob) &&
        typeof rawJob.uses === "string" &&
        rawJob.uses.startsWith("./")
      ) {
        called.add(path.resolve(root, rawJob.uses));
      }
    }
  }
  return called;
}

function workflowTriggers(workflow: WorkflowFile): string[] {
  const doc = isRecord(workflow.document) ? workflow.document : {};
  return normalizeTriggers(doc.on ?? doc["on"]);
}

function contextCanReach(
  reachableEvents: string[],
  contextEvents: string[],
): boolean {
  return (
    contextEvents.includes("*") ||
    contextEvents.some((event) => reachableEvents.includes(event))
  );
}

function isUnsafeCheckout(step: WorkflowMap): boolean {
  if (
    typeof step.uses !== "string" ||
    !/^actions\/checkout@/i.test(step.uses)
  ) {
    return false;
  }
  const ref = isRecord(step.with) ? String(step.with.ref ?? "") : "";
  return /github\.(?:event\.pull_request\.head\.(?:sha|ref)|head_ref)/i.test(
    ref,
  );
}

function materializeInputs(
  value: string,
  inputValues: Record<string, string>,
): string {
  return value.replace(
    /\$\{\{\s*inputs\.([A-Za-z0-9_-]+)\s*\}\}/g,
    (original, name: string) => inputValues[name] ?? original,
  );
}

function toStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : JSON.stringify(item ?? ""),
    ]),
  );
}

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

function locateJobLine(raw: string, jobName: string): number {
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

function locateStepLine(
  raw: string,
  jobName: string,
  stepName: string,
  stepIndex: number,
): number {
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

  const stepStarts: number[] = [];
  const quotedName = stripYamlQuotes(stepName);
  let itemIndent: number | undefined;
  for (let index = stepsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && indentation(line) <= stepsIndent) break;
    const match = /^(\s*)-\s+(?:name\s*:\s*)?(.*)$/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    if (itemIndent === undefined) itemIndent = indent;
    if (indent !== itemIndent) continue;
    stepStarts.push(index + 1);
    if (
      /^\s*-\s+name\s*:/.test(line) &&
      stripYamlQuotes(match[2].trim()) === quotedName
    ) {
      return index + 1;
    }
  }
  return stepStarts[stepIndex] ?? jobLine;
}

function keyMatcher(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')\\s*:`);
}

function stripYamlQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function indentation(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

function isLocalAction(uses: string): boolean {
  return uses.startsWith("./") || uses.startsWith("docker://");
}

function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function shrink(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function unionEvents(events: string[]): string[] {
  return [...new Set(events)].sort();
}

function mergeOutput(target: AnalysisOutput, source: AnalysisOutput): void {
  target.findings.push(...source.findings);
  target.diagnostics.push(...source.diagnostics);
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.file}:${diagnostic.job ?? ""}:${diagnostic.line ?? ""}:${diagnostic.message}`;
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

function isRecord(value: unknown): value is WorkflowMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
