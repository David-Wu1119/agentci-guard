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
  looksLikeAiAction,
  looksLikeAiCli,
  untrustedGitHubContextEvents,
} from "./detect.js";
import { RULES, SEVERITY_ORDER } from "./rules.js";
import type {
  AgentUsage,
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
  stepIndex?: number;
  evidence: string;
  line?: number;
  events?: string[];
  callChain?: string[];
};
type AnalysisOutput = {
  agentUsages: AgentUsage[];
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
  called: Set<string>;
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
    called: new Set(),
  };

  const roots = workflows.filter((workflow) => {
    const triggers = workflowTriggers(workflow);
    return (
      workflow.parse_error !== undefined ||
      triggers.length === 0 ||
      triggers.some((trigger) => trigger !== "workflow_call")
    );
  });

  const output: AnalysisOutput = {
    agentUsages: [],
    findings: [],
    diagnostics: [],
  };
  for (const workflow of roots) {
    const triggers = workflowTriggers(workflow);
    const directEvents = triggers.filter(
      (trigger) => trigger !== "workflow_call",
    );
    const rootContext =
      directEvents.length !== triggers.length
        ? { ...EMPTY_REUSABLE_CONTEXT, events: directEvents }
        : EMPTY_REUSABLE_CONTEXT;
    mergeOutput(output, analyzeWorkflow(workflow, repository, rootContext));
  }

  // A reusable workflow without a reachable local caller has unknown caller
  // inputs, events, secrets, and token permissions. Analyze call-only files
  // once so their contents remain visible, and mark dual-trigger files partial.
  for (const workflow of workflows) {
    const absolute = path.resolve(workflow.path);
    if (
      !workflowTriggers(workflow).includes("workflow_call") ||
      repository.called.has(absolute)
    ) {
      continue;
    }
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
    if (!repository.analyzed.has(absolute)) {
      mergeOutput(
        output,
        analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT),
      );
    }
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
    agent_usages: dedupeAgentUsages(output.agentUsages),
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
    followSymbolicLinks: false,
    onlyFiles: true,
  });
  const workflows: WorkflowFile[] = [];
  for (const file of entries.sort()) {
    const metadata = await fs.lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
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
    called: new Set(),
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
      agentUsages: [],
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
  const output: AnalysisOutput = {
    agentUsages: [],
    findings: [],
    diagnostics: [],
  };

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
      const stepLine = locateStepLine(workflow.raw, jobName, index);
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
      const effectiveWith = materializeStructure(
        rawStep.with,
        context.inputValues,
      );
      const stepUsesAi =
        looksLikeAiAction(materializeInputs(stepUses, context.inputValues)) ||
        looksLikeAiCli(materializeInputs(stepRun, context.inputValues));
      const untrustedEvents = untrustedGitHubContextEvents(
        materializeInputs(
          JSON.stringify({
            step: stripGuards(rawStep),
            effectiveEnvironment,
          }),
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
        output.agentUsages.push({
          id: [file, jobName, index, context.callChain.join(">")].join(":"),
          file,
          job: jobName,
          step: stepName,
          step_index: index,
          kind:
            stepRun.trim().length > 0
              ? "cli"
              : stepUses.length > 0
                ? "action"
                : "other",
          evidence:
            stepRun.trim().length > 0
              ? shrink(stepRun)
              : shrink(stepUses || materialized),
          line: stepLine,
          reachable_events: stepReachability.events,
          call_chain:
            context.callChain.length > 0 ? context.callChain : undefined,
        });
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
              stepIndex: index,
              evidence: shrink(materialized),
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain,
            }),
          );
        }
        if (stepRun.trim().length > 0 || containsShellAccess(effectiveWith)) {
          output.findings.push(
            makeFinding("agentci/ai-shell-access", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence:
                stepRun.trim().length > 0
                  ? `AI CLI executes through run: ${shrink(stepRun)}`
                  : shrink(JSON.stringify(effectiveWith)),
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
              stepIndex: index,
              evidence: `uses: ${stepUses}`,
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain,
            }),
          );
        }
      }

      if (stepReachability.events.includes("pull_request_target")) {
        const checkout = assessPullRequestTargetCheckout(rawStep);
        if (checkout === "unsafe") {
          output.findings.push(
            makeFinding("agentci/unsafe-checkout", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: shrink(JSON.stringify(rawStep)),
              line: stepLine,
              events: stepReachability.events,
              callChain: context.callChain,
            }),
          );
        } else if (checkout === "unknown") {
          output.diagnostics.push({
            code: "agentci/analysis-checkout-protection-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            line: stepLine,
            message:
              "The checkout step requests pull-request code, but its ref does not identify whether GitHub's built-in unsafe-PR protection is present.",
          });
        }
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
      agentUsages: [],
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
      agentUsages: [],
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
  repository.called.add(targetPath);
  if (context.stack.includes(targetPath)) {
    return {
      agentUsages: [],
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
    inputValues: toStringMap(rawJob.with, context.inputValues),
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
  const id = `${ruleId}:${context.file}:${context.job ?? ""}:${context.stepIndex ?? ""}:${chain}`;
  return {
    id,
    rule_id: rule.id,
    title: rule.title,
    severity: rule.severity,
    file: context.file,
    job: context.job,
    step: context.step,
    step_index: context.stepIndex,
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

function assessPullRequestTargetCheckout(
  step: WorkflowMap,
): "not-applicable" | "protected" | "unsafe" | "unknown" {
  if (
    typeof step.uses !== "string" ||
    !/^actions\/checkout@/i.test(step.uses)
  ) {
    return "not-applicable";
  }
  const inputs = isRecord(step.with) ? step.with : {};
  const ref = String(inputs.ref ?? "");
  const checkoutRepository = String(inputs.repository ?? "");
  const requestsPullRequestCode =
    /github\.(?:event\.pull_request\.(?:head\.(?:sha|ref)|merge_commit_sha)|head_ref)/i.test(
      ref,
    ) ||
    /refs\/pull\/[^\n]+\/(?:head|merge)/i.test(ref) ||
    /github\.event\.pull_request\.head\.repo\.full_name/i.test(
      checkoutRepository,
    );
  if (!requestsPullRequestCode) return "not-applicable";

  const actionRef = step.uses.slice(step.uses.lastIndexOf("@") + 1);
  const protection = /^v1(?:$|\.)/i.test(actionRef)
    ? "absent"
    : /^v[2-7]$/i.test(actionRef) || /^v7\./i.test(actionRef)
      ? "present"
      : "unknown";
  const optOut = literalBoolean(inputs["allow-unsafe-pr-checkout"]);

  if (protection === "absent" || optOut === true) return "unsafe";
  if (protection === "present" && optOut === false) return "protected";
  return "unknown";
}

function literalBoolean(value: unknown): boolean | "unknown" {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "${{ false }}") return false;
  if (normalized === "true" || normalized === "${{ true }}") return true;
  return "unknown";
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

function materializeStructure(
  value: unknown,
  inputValues: Record<string, string>,
): unknown {
  if (typeof value === "string") return materializeInputs(value, inputValues);
  if (Array.isArray(value)) {
    return value.map((item) => materializeStructure(item, inputValues));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        materializeStructure(item, inputValues),
      ]),
    );
  }
  return value;
}

function toStringMap(
  value: unknown,
  parentInputs: Record<string, string> = {},
): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      materializeInputs(
        typeof item === "string" ? item : JSON.stringify(item ?? ""),
        parentInputs,
      ),
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
  let childIndent: number | undefined;
  for (let index = jobsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = indentation(line);
    if (indent <= jobsIndent) break;
    if (childIndent === undefined) childIndent = indent;
    if (indent !== childIndent) continue;
    if (matcher.test(line.trim())) return index + 1;
  }
  return jobsIndex + 1;
}

function locateStepLine(
  raw: string,
  jobName: string,
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
  }
  return stepStarts[stepIndex] ?? jobLine;
}

function keyMatcher(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')\\s*:`);
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
  target.agentUsages.push(...source.agentUsages);
  target.findings.push(...source.findings);
  target.diagnostics.push(...source.diagnostics);
}

function dedupeAgentUsages(usages: AgentUsage[]): AgentUsage[] {
  const seen = new Set<string>();
  return usages.filter((usage) => {
    if (seen.has(usage.id)) return false;
    seen.add(usage.id);
    return true;
  });
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
