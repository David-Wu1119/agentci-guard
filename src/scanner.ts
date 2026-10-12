import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { loadConfig, matchesPath, parseInlineIgnores } from "./config.js";
import type { AgentciConfig } from "./config.js";
import {
  aiCliInvocations,
  aiHttpDispatches,
  containsSecretReference,
  containsShellAccess,
  githubExpressionEnd,
  hasAgentGateBypass,
  hasOpaqueAiCliShellCommand,
  hasOpaqueAiCliSubstitution,
  hasOpaqueAiHttpShellCommand,
  hasOpaqueAiHttpSubstitution,
  hasOpaqueAiShellFunction,
  hasOpaqueAiShellGrouping,
  isPinnedAction,
  isSelfGatingAgentAction,
  looksLikeAiAction,
  SELF_GATED_EVENTS,
  untrustedGitHubContextMatches,
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
  hasTrustedActorGate,
  hasTrustedPrProvenanceGate,
  narrowEventsDetailed,
  normalizeTriggers,
  permissionLevel,
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
  uncertainEvents?: string[];
  callChain?: string[];
};
type AnalysisOutput = {
  agentUsages: AgentUsage[];
  findings: Finding[];
  diagnostics: Diagnostic[];
};
type ReusableContext = {
  events?: string[];
  uncertainEvents?: string[];
  triggerSource?: unknown;
  creationOnlyEvents?: string[];
  actorGate?: boolean;
  prGate?: boolean;
  permissionCeiling?: EffectivePermissions;
  inputValues: Record<string, string>;
  inputUnknownEvents?: Record<string, string[]>;
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
  stack: [],
  callChain: [],
};

// This immutable revision throws on discussion events before Claude starts.
// Source: https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/context.ts#L250-L251
const ANTHROPIC_ACTION_WITHOUT_DISCUSSION =
  "1d6de8cb0c237e7c15e9e1bdf973826ebae490cc";
// This revision's inspected detector selects agent mode for a static prompt;
// agent mode forwards that prompt without an automatic Issue-body fetch.
// Sources: https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/detector.ts#L20-L84
// https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/agent/index.ts#L78-L90
const ANTHROPIC_ACTION_AGENT_PROMPT_VERIFIED =
  "787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251";
// Only these immutable revisions have an inspected triggering-actor write gate.
// Sources: https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/github/validation/permissions.ts
// https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md
const VERIFIED_ANTHROPIC_WRITE_GATES = new Set([
  ANTHROPIC_ACTION_AGENT_PROMPT_VERIFIED,
  ANTHROPIC_ACTION_WITHOUT_DISCUSSION,
]);

export async function scanRepository(
  root: string,
  options: Partial<ScanOptions> = {},
): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();
  const scanRoot = path.resolve(cwd, root);
  const rootStat = await fs.stat(scanRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`scan path is not a directory: ${root}`);
  }
  const config = await loadConfig(scanRoot, options.configPath);
  const workflows = await loadWorkflowFiles(scanRoot);
  return scanWorkflowFiles(workflows, scanRoot, config);
}

/**
 * Analyze an already-loaded set of workflow files as one repository. The
 * filesystem scan and the organization scan both end here, so a fetched
 * workflow is analyzed exactly as a checked-out one.
 */
export function scanWorkflowFiles(
  workflows: WorkflowFile[],
  scanRoot: string,
  config: AgentciConfig,
): ScanResult {
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
    // A verified unsupported Action event is a closed path, not uncertainty.
    analysis_complete: diagnostics.every(
      (diagnostic) =>
        diagnostic.code === "agentci/analysis-agent-event-unsupported",
    ),
  };
}

export async function loadWorkflowFiles(root: string): Promise<WorkflowFile[]> {
  const directory = path.resolve(root, ".github/workflows");
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const workflows: WorkflowFile[] = [];
  for (const name of entries.filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const file = path.join(directory, name);
    const metadata = await fs.lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
    const raw = await fs.readFile(file, "utf8");
    workflows.push(parseWorkflowFile(file, raw));
  }
  return workflows;
}

/** Parse raw workflow YAML into a WorkflowFile, recording a parse error instead of throwing. */
export function parseWorkflowFile(file: string, raw: string): WorkflowFile {
  const document = YAML.parseDocument(raw, { prettyErrors: true });
  const error = document.errors[0];
  if (error) {
    const line = error.linePos?.[0]?.line;
    return {
      path: file,
      raw,
      document: undefined,
      parse_error: { message: error.message, line },
    };
  }
  return { path: file, raw, document: document.toJS() };
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
  const creationOnlyEvents = new Set(
    context.creationOnlyEvents ?? creationOnlyTriggers(doc.on),
  );
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
    const jobReachability = narrowEventsDetailed(workflowEvents, rawJob.if);
    const jobUncertainEvents = jobReachability.events.filter(
      (event) =>
        context.uncertainEvents?.includes(event) ||
        jobReachability.unknownEvents.includes(event),
    );
    const jobActorGate =
      Boolean(context.actorGate) || hasTrustedActorGate(rawJob.if);
    const jobPrGate =
      Boolean(context.prGate) || hasTrustedPrProvenanceGate(rawJob.if);
    if (!jobReachability.complete) {
      output.diagnostics.push({
        code: "agentci/analysis-event-condition",
        kind: "analysis",
        severity: "warning",
        file,
        job: jobName,
        line: jobLine,
        message:
          "Could not fully interpret this job's if condition; unresolved branches retain possible event paths, so findings in this job may depend on those paths.",
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
          jobUncertainEvents,
          [...creationOnlyEvents],
          jobPermissions,
          repository,
          { ...context, triggerSource: context.triggerSource ?? doc.on },
        ),
      );
      continue;
    }

    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobEnvironment = mergeEnvironment(workflowEnvironment, rawJob.env);
    const aiSteps: Array<{
      hasSecret: boolean;
      hasUntrustedIngestion: boolean;
      remoteHttp: boolean;
      ungatedIngestionEvents: string[];
      potentialAppWrite: boolean;
      ingestionEvents: string[];
      implicitIngestionUnknown: boolean;
      toolFetchUnknownEvents: string[];
      /** The job or this step carries a recognized actor/provenance gate. */
      actorGated: boolean;
      events: string[];
      uncertainEvents: string[];
    }> = [];
    const runDataflowUnknownEvents: string[][] = [];
    const priorStepOutputEvents = new Map<string, string[]>();
    const untrustedEnvTransferEvents = new Set<string>();
    const outputEnvTransferEvents = new Set<string>();
    const matrixEnvTransferEvents = new Set<string>();
    const reusableInputEnvTransferEvents = new Set<string>();
    const untrustedRunPaths: Array<{
      events: string[];
      uncertainEvents: string[];
    }> = [];
    const secretEnvTransferEvents = new Set<string>();
    const unresolvedOutputEvents = (material: string, reachable: string[]) =>
      unionEvents([
        ...outputContextReferences(material, "steps").flatMap(({ id }) =>
          id === null
            ? [...priorStepOutputEvents.values()].flat()
            : (priorStepOutputEvents.get(id) ?? []),
        ),
        ...outputContextReferences(material, "needs").flatMap(
          ({ id, output: outputName }) => {
            const declaredNeeds = Array.isArray(rawJob.needs)
              ? rawJob.needs
              : [rawJob.needs];
            if (
              id === null &&
              rawJob.needs === undefined &&
              Object.keys(context.inputValues).length === 0
            ) {
              return [];
            }
            if (
              id === null &&
              Object.keys(context.inputValues).length === 0 &&
              declaredNeeds.every((name) => {
                const dependency = jobs[name];
                return (
                  isRecord(dependency) &&
                  dependency.uses === undefined &&
                  (!isRecord(dependency.outputs) ||
                    Object.values(dependency.outputs).every(
                      (value) =>
                        typeof value === "string" && !value.includes("${{"),
                    ))
                );
              })
            ) {
              return [];
            }
            const producer = id === null ? undefined : jobs[id];
            const direct = id !== null && declaredNeeds.includes(id);
            const outputs =
              isRecord(producer) && isRecord(producer.outputs)
                ? producer.outputs
                : undefined;
            if (
              direct &&
              outputs &&
              (outputName === null
                ? Object.values(outputs).every(
                    (value) =>
                      typeof value === "string" && !value.includes("${{"),
                  )
                : typeof outputs[outputName] === "string" &&
                  !outputs[outputName].includes("${{"))
            ) {
              return [];
            }
            // shortcut: caller-provided and computed job outputs remain unresolved; upgrade with cross-job provenance.
            return isRecord(producer)
              ? narrowEventsDetailed(workflowEvents, producer.if).events
              : reachable;
          },
        ),
      ]).filter((event) => reachable.includes(event));
    const inputProvenance = (material: string) => {
      const references = outputContextReferences(material, "inputs");
      return {
        material: references
          .flatMap(({ id }) =>
            id === null
              ? Object.values(context.inputValues)
              : [context.inputValues[id] ?? ""],
          )
          .join("\n"),
        opaque:
          context.callChain.length > 0 &&
          references.some(({ id }) =>
            id === null
              ? Object.values(context.inputValues).some((value) =>
                  value.includes("${{"),
                )
              : context.inputValues[id] === undefined ||
                context.inputValues[id].includes("${{"),
          ),
      };
    };
    const unknownCallerInputEvents = (material: string, reachable: string[]) =>
      unionEvents(
        outputContextReferences(material, "inputs").flatMap(({ id }) =>
          id === null
            ? Object.values(context.inputUnknownEvents ?? {}).flat()
            : (context.inputUnknownEvents?.[id] ?? []),
        ),
      ).filter((event) => reachable.includes(event));
    const matrixMaterial = isRecord(rawJob.strategy)
      ? JSON.stringify(rawJob.strategy.matrix ?? "")
      : "";
    const matrixInput = inputProvenance(matrixMaterial);
    const matrixProvenanceMaterial = `${matrixMaterial}\n${matrixInput.material}`;
    const unresolvedMatrixEvents = unresolvedOutputEvents(
      matrixProvenanceMaterial,
      jobReachability.events,
    );
    const matrixSourceMatches = untrustedGitHubContextMatches(
      matrixProvenanceMaterial,
    );
    const activeMatrixSourceEvents = (
      reachable: string[],
      actorGated: boolean,
      prGated: boolean,
    ) =>
      unionEvents(
        matrixSourceMatches
          .filter(
            (match) =>
              contextCanReach(reachable, [match.event]) &&
              !sourceTrustedByGate(
                match.source,
                match.event,
                actorGated,
                prGated,
                creationOnlyEvents,
              ),
          )
          .flatMap((match) =>
            match.event === "*" ? reachable : [match.event],
          ),
      );

    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord(rawStep)) continue;
      const stepName =
        typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
      const stepLine = locateStepLine(workflow.raw, jobName, index);
      let stepReachability = narrowEventsDetailed(
        jobReachability.events,
        rawStep.if,
      );
      if (!stepReachability.complete) {
        output.diagnostics.push({
          code: "agentci/analysis-event-condition",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "Could not fully interpret this step's if condition; unresolved branches retain possible event paths, so findings at this step may depend on those paths.",
        });
      }
      if (stepReachability.events.length === 0) continue;

      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const actionReference = materializeInputs(stepUses, context.inputValues);
      const pinnedAnthropicRef =
        /^anthropics\/claude-code-action@([0-9a-f]{40})$/i
          .exec(actionReference)?.[1]
          ?.toLowerCase();
      const effectiveWith = materializeStructure(
        rawStep.with,
        context.inputValues,
      );
      const discussionEvents = isSelfGatingAgentAction(actionReference)
        ? stepReachability.events.filter(
            (event) => event === "discussion" || event === "discussion_comment",
          )
        : [];
      const vendorUnknownEvents: string[] =
        pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION
          ? []
          : discussionEvents;
      if (discussionEvents.length > 0) {
        const knownUnsupported =
          pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION;
        output.diagnostics.push({
          code: knownUnsupported
            ? "agentci/analysis-agent-event-unsupported"
            : "agentci/analysis-agent-event-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: knownUnsupported
            ? "This verified Anthropic Action revision rejects discussion events before Claude starts; those paths were excluded from AI findings."
            : "This Anthropic Action ref's discussion-event support is unverified; findings on those paths are potential, not confirmed execution.",
        });
        if (knownUnsupported) {
          stepReachability = {
            ...stepReachability,
            events: stepReachability.events.filter(
              (event) =>
                event !== "discussion" && event !== "discussion_comment",
            ),
          };
          if (stepReachability.events.length === 0) continue;
        }
      }

      // This pinned detector rejects unsupported tracked events and skips promptless PRs.
      // Sources: https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/detector.ts#L20-L114
      // https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/entrypoints/run.ts#L174-L195
      if (pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION) {
        const inputs = isRecord(effectiveWith) ? effectiveWith : {};
        const progress = String(inputs.track_progress ?? "");
        const noPrompt = String(inputs.prompt ?? "") === "";
        const triggerSource = context.triggerSource ?? doc.on;
        const triggers = isRecord(triggerSource) ? triggerSource : {};
        const unsupportedEvents = stepReachability.events.filter((event) => {
          const isPr =
            event === "pull_request" || event === "pull_request_target";
          if (progress !== "true") {
            return isPr && !progress.includes("${{") && noPrompt;
          }
          if (
            event !== "workflow_call" &&
            ![
              "pull_request",
              "pull_request_target",
              "issues",
              "issue_comment",
              "pull_request_review",
              "pull_request_review_comment",
            ].includes(event)
          ) {
            return true;
          }
          if (!isPr) return false;
          const trigger = triggers[event];
          const types = isRecord(trigger) ? trigger.types : undefined;
          return (
            Array.isArray(types) &&
            types.length > 0 &&
            types.every(
              (type) =>
                typeof type === "string" &&
                ![
                  "opened",
                  "synchronize",
                  "ready_for_review",
                  "reopened",
                  "labeled",
                ].includes(type),
            )
          );
        });
        if (unsupportedEvents.length > 0) {
          output.diagnostics.push({
            code: "agentci/analysis-agent-event-unsupported",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "This verified Anthropic Action revision skips or rejects the configured event/input paths before Claude starts; those paths were excluded from AI findings.",
          });
          stepReachability = {
            ...stepReachability,
            events: stepReachability.events.filter(
              (event) => !unsupportedEvents.includes(event),
            ),
          };
          if (stepReachability.events.length === 0) continue;
        }
      }

      const stepUncertainEvents = stepReachability.events.filter(
        (event) =>
          jobUncertainEvents.includes(event) ||
          stepReachability.unknownEvents.includes(event) ||
          vendorUnknownEvents.includes(event),
      );

      const effectiveEnvironment = mergeEnvironment(
        jobEnvironment,
        rawStep.env,
      );
      const materialized = materializeInputs(
        JSON.stringify({
          uses: rawStep.uses,
          run: rawStep.run,
          with: rawStep.with,
          env: effectiveEnvironment,
          shell: rawStep.shell,
          "working-directory": rawStep["working-directory"],
        }),
        context.inputValues,
      );
      const stepRun = typeof rawStep.run === "string" ? rawStep.run : "";
      const stepUsesAiAction = looksLikeAiAction(actionReference);
      const materializedRun = materializeInputs(stepRun, context.inputValues);
      const cliInvocations = aiCliInvocations(materializedRun);
      const stepUsesAiCli = cliInvocations.length > 0;
      const httpDispatches = aiHttpDispatches(materializedRun);
      const stepUsesAi =
        stepUsesAiAction || stepUsesAiCli || httpDispatches.length > 0;
      if (
        cliInvocations.some((invocation) => invocation.uncertainControlFlow) ||
        httpDispatches.some((dispatch) => dispatch.uncertainControlFlow) ||
        ((stepUsesAiCli || httpDispatches.length > 0) &&
          hasOpaqueAiShellGrouping(materializedRun))
      ) {
        output.diagnostics.push({
          code: "agentci/analysis-shell-control-flow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "An AI invocation appears in a shell branch or group whose reachability cannot be resolved statically; findings describe a possible path, not guaranteed execution.",
        });
      }
      if (
        hasOpaqueAiCliSubstitution(materializedRun) ||
        hasOpaqueAiHttpSubstitution(materializedRun) ||
        hasOpaqueAiShellFunction(materializedRun) ||
        hasOpaqueAiCliShellCommand(materializedRun) ||
        hasOpaqueAiHttpShellCommand(materializedRun)
      ) {
        runDataflowUnknownEvents[index] = stepReachability.events;
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "A possible AI call inside command substitution, a shell-evaluated string, or a shell function could not be attributed to a direct executable command.",
        });
      }
      const httpOnly =
        httpDispatches.length > 0 && !stepUsesAiCli && !stepUsesAiAction;
      const httpCommands = httpDispatches
        .map((dispatch) => dispatch.command)
        .join("\n");
      const cliCommands = cliInvocations
        .map((invocation) => invocation.command)
        .join("\n");
      const cliExpandableCommands = cliInvocations
        .map((invocation) => invocation.expandableCommand)
        .join("\n");
      const payload = httpDispatches
        .map((dispatch) => dispatch.payload)
        .join("\n");
      const referencedEnvironment = (
        expressionText: string,
        shellText: string,
      ) =>
        Object.fromEntries(
          Object.entries(effectiveEnvironment).filter(([name]) => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return (
              new RegExp(
                `\\$\\{\\{\\s*env(?:\\.${escaped}|\\[\\s*['\"]${escaped}['\"]\\s*\\])\\s*\\}\\}`,
                "i",
              ).test(expressionText) ||
              new RegExp(
                `\\$(?:\\{${escaped}\\}|${escaped}(?![A-Za-z0-9_]))`,
              ).test(shellText)
            );
          }),
        );
      const cliEnvironment = referencedEnvironment(
        cliCommands,
        cliExpandableCommands,
      );
      const sinkMaterial = stepUsesAiAction
        ? materialized
        : JSON.stringify({
            cli: cliCommands,
            cli_env: cliEnvironment,
            payload,
            http_env: referencedEnvironment(
              payload,
              httpDispatches
                .map((dispatch) => dispatch.expandablePayload)
                .join("\n"),
            ),
          });
      const secretMaterial = httpOnly
        ? JSON.stringify({
            command: httpCommands,
            env: referencedEnvironment(
              httpCommands,
              httpDispatches
                .map((dispatch) => dispatch.expandableCommand)
                .join("\n"),
            ),
          })
        : "";
      const stepActorGate = jobActorGate || hasTrustedActorGate(rawStep.if);
      const stepPrGate = jobPrGate || hasTrustedPrProvenanceGate(rawStep.if);
      if (stepUsesAi) {
        const shellMayReadEarlierOutput =
          (stepUsesAiCli &&
            (/\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/.test(
              cliExpandableCommands,
            ) ||
              cliInvocations.some((invocation) => invocation.pipedInput))) ||
          httpDispatches.some(
            (dispatch) =>
              /\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/.test(
                dispatch.expandablePayload,
              ) || dispatch.opaquePayload,
          );
        const outputAliasMaterial = stepUsesAiCli
          ? `${sinkMaterial}\n${JSON.stringify(effectiveEnvironment)}`
          : sinkMaterial;
        const possibleOutputMaterial = shellMayReadEarlierOutput
          ? `${outputAliasMaterial}\n${materializedRun}`
          : outputAliasMaterial;
        const input = inputProvenance(possibleOutputMaterial);
        const readsMatrix =
          outputContextReferences(possibleOutputMaterial, "matrix").length > 0;
        const outputEvents = unionEvents([
          ...unresolvedOutputEvents(
            `${possibleOutputMaterial}\n${input.material}`,
            stepReachability.events,
          ),
          ...(readsMatrix
            ? unresolvedMatrixEvents.filter((event) =>
                stepReachability.events.includes(event),
              )
            : []),
        ]);
        if (outputEvents.length > 0) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...outputEvents,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-output-provenance-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An AI input consumes a prior step or job output whose source provenance is not modeled.",
          });
        }
        const matrixSourceEvents = readsMatrix
          ? activeMatrixSourceEvents(
              stepReachability.events,
              stepActorGate,
              stepPrGate,
            )
          : [];
        if (matrixSourceEvents.length > 0) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...matrixSourceEvents,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-matrix-provenance-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An AI input reads a matrix derived from untrusted event text; matrix value flow is not modeled.",
          });
        }
        if (
          (input.opaque ||
            (readsMatrix && matrixInput.opaque) ||
            unknownCallerInputEvents(
              JSON.stringify({
                run: rawStep.run,
                with: rawStep.with,
                env: effectiveEnvironment,
              }),
              stepReachability.events,
            ).length > 0) &&
          outputEvents.length === 0 &&
          matrixSourceEvents.length === 0
        ) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...stepReachability.events,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-reusable-input-provenance-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An AI input depends on a dynamic reusable-workflow input whose source cannot be resolved.",
          });
        }
      }
      if (
        stepUsesAi &&
        stepReachability.events.some((event) =>
          secretEnvTransferEvents.has(event),
        )
      ) {
        output.diagnostics.push({
          code: "agentci/analysis-secret-env-transfer-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "An earlier step may write a secret to GITHUB_ENV; exposure to this AI step is not modeled.",
        });
      }
      if (stepUsesAi) {
        const inheritedEvents = stepReachability.events.filter((event) =>
          untrustedEnvTransferEvents.has(event),
        );
        if (inheritedEvents.length > 0) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...inheritedEvents,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-run-dataflow-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An earlier step may write untrusted event text to GITHUB_ENV; input to this AI step is unresolved.",
          });
        }
        const inheritedOutputEvents = stepReachability.events.filter((event) =>
          outputEnvTransferEvents.has(event),
        );
        if (inheritedOutputEvents.length > 0) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...inheritedOutputEvents,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-output-provenance-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An earlier step may pass an unresolved step or job output through GITHUB_ENV to this AI step.",
          });
        }
        const inheritedMatrixEvents = stepReachability.events.filter((event) =>
          matrixEnvTransferEvents.has(event),
        );
        if (inheritedMatrixEvents.length > 0) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...inheritedMatrixEvents,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-matrix-provenance-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An earlier step may pass an event-derived matrix value through GITHUB_ENV to this AI step.",
          });
        }
        const inheritedInputEvents = stepReachability.events.filter((event) =>
          reusableInputEnvTransferEvents.has(event),
        );
        if (inheritedInputEvents.length > 0) {
          runDataflowUnknownEvents[index] = unionEvents([
            ...(runDataflowUnknownEvents[index] ?? []),
            ...inheritedInputEvents,
          ]);
          output.diagnostics.push({
            code: "agentci/analysis-reusable-input-provenance-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "An earlier step may pass a dynamic reusable-workflow input through GITHUB_ENV to this AI step.",
          });
        }
      }
      // shortcut: only the first step's default Ubuntu literal assignment has no prior step state; upgrade with shell dataflow.
      const defaultUbuntuShell =
        index === 0 &&
        typeof rawJob["runs-on"] === "string" &&
        /^ubuntu-(?:latest|\d{2}\.\d{2})$/.test(rawJob["runs-on"]) &&
        rawJob.container === undefined &&
        rawStep.shell === undefined &&
        doc.defaults === undefined &&
        rawJob.defaults === undefined;
      const literalEchoSafeShell =
        defaultUbuntuShell &&
        !Object.keys(effectiveEnvironment).some(
          (name) =>
            ["BASH_ENV", "ENV", "BASHOPTS", "SHELLOPTS"].includes(name) ||
            name.startsWith("BASH_FUNC_"),
        );
      const literalGithubEnvWrite =
        literalEchoSafeShell &&
        /^[ \t]*echo[ \t]+(?:"[A-Za-z_]\w*=[A-Za-z0-9._/-]*"|'[A-Za-z_]\w*=[A-Za-z0-9._/-]*')[ \t]*>>[ \t]*(?:"\$GITHUB_ENV"|\$GITHUB_ENV)[ \t]*$/.test(
          materializedRun,
        );
      const literalGithubOutputWrite =
        literalEchoSafeShell &&
        /^[ \t]*echo[ \t]+(?:"[A-Za-z_]\w*=[A-Za-z0-9._/-]*"|'[A-Za-z_]\w*=[A-Za-z0-9._/-]*')[ \t]*>>[ \t]*(?:"\$GITHUB_OUTPUT"|\$GITHUB_OUTPUT)[ \t]*$/.test(
          materializedRun,
        );
      const mayTransferToGithubEnv =
        /\bGITHUB_ENV\b/.test(materializedRun) && !literalGithubEnvWrite;
      if (
        mayTransferToGithubEnv &&
        (containsSecretReference(materializedRun) ||
          containsSecretReference(JSON.stringify(effectiveEnvironment)))
      ) {
        for (const event of stepReachability.events) {
          secretEnvTransferEvents.add(event);
        }
      }
      const activeMatches = (value: string) =>
        untrustedGitHubContextMatches(value).filter(
          (match) =>
            contextCanReach(stepReachability.events, [match.event]) &&
            !sourceTrustedByGate(
              match.source,
              match.event,
              stepActorGate,
              stepPrGate,
              creationOnlyEvents,
            ),
        );
      if (mayTransferToGithubEnv) {
        const writerMaterial = JSON.stringify({
          run: materializedRun,
          env: effectiveEnvironment,
        });
        const writerInput = inputProvenance(writerMaterial);
        const writerReadsMatrix =
          outputContextReferences(writerMaterial, "matrix").length > 0;
        const writerOutputEvents = unionEvents([
          ...unresolvedOutputEvents(
            `${writerMaterial}\n${writerInput.material}`,
            stepReachability.events,
          ),
          ...(writerReadsMatrix
            ? unresolvedMatrixEvents.filter((event) =>
                stepReachability.events.includes(event),
              )
            : []),
        ]);
        for (const event of writerOutputEvents) {
          outputEnvTransferEvents.add(event);
        }
        const writerMatrixEvents = writerReadsMatrix
          ? activeMatrixSourceEvents(
              stepReachability.events,
              stepActorGate,
              stepPrGate,
            )
          : [];
        for (const event of writerMatrixEvents) {
          matrixEnvTransferEvents.add(event);
        }
        if (
          (writerInput.opaque || (writerReadsMatrix && matrixInput.opaque)) &&
          writerOutputEvents.length === 0 &&
          writerMatrixEvents.length === 0
        ) {
          for (const event of stepReachability.events) {
            reusableInputEnvTransferEvents.add(event);
          }
        }
        for (const event of unknownCallerInputEvents(
          JSON.stringify({ run: rawStep.run, env: effectiveEnvironment }),
          stepReachability.events,
        )) {
          reusableInputEnvTransferEvents.add(event);
        }
        for (const match of activeMatches(writerMaterial)) {
          for (const event of match.event === "*"
            ? stepReachability.events
            : [match.event]) {
            untrustedEnvTransferEvents.add(event);
          }
        }
      }
      if (typeof rawStep.id === "string") {
        priorStepOutputEvents.set(
          rawStep.id,
          literalGithubOutputWrite ? [] : stepReachability.events,
        );
      }
      const sinkMatches = activeMatches(sinkMaterial);
      const pipedInputMatches = cliInvocations.flatMap((invocation) =>
        activeMatches(invocation.pipedInput),
      );
      const runContextMatches = activeMatches(materializedRun);
      const inheritedUnknownEvents = unionEvents(
        activeMatches(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(effectiveEnvironment).filter(
                ([name]) =>
                  !Object.prototype.hasOwnProperty.call(cliEnvironment, name),
              ),
            ),
          ),
        ).flatMap((match) =>
          match.event === "*" ? stepReachability.events : [match.event],
        ),
      );
      const opaqueCliInput = cliInvocations.some(
        (invocation) => invocation.opaqueInput,
      );
      // shortcut: shell variable and pipe flow is unresolved; upgrade with a shell dataflow model.
      const shellInputUnknownEvents =
        /\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/.test(cliExpandableCommands) ||
        cliInvocations.some((invocation) => invocation.pipedInput.length > 0)
          ? unionEvents(
              runContextMatches.flatMap((match) =>
                match.event === "*" ? stepReachability.events : [match.event],
              ),
            )
          : [];
      if (
        stepUsesAiCli &&
        (opaqueCliInput ||
          pipedInputMatches.length > 0 ||
          shellInputUnknownEvents.length > 0 ||
          inheritedUnknownEvents.length > 0)
      ) {
        const matchedEvents = unionEvents([
          ...pipedInputMatches.flatMap((match) =>
            match.event === "*" ? stepReachability.events : [match.event],
          ),
          ...shellInputUnknownEvents,
          ...inheritedUnknownEvents,
        ]);
        runDataflowUnknownEvents[index] = unionEvents([
          ...(runDataflowUnknownEvents[index] ?? []),
          ...(opaqueCliInput || matchedEvents.length === 0
            ? stepReachability.events
            : matchedEvents),
        ]);
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "The local AI CLI's stdin, shell variables, or inherited environment may carry input that command-level analysis cannot prove.",
        });
      }
      if (
        httpOnly &&
        ((activeMatches(materializedRun).length > 0 &&
          activeMatches(sinkMaterial).length === 0) ||
          (containsSecretReference(materializedRun) &&
            !containsSecretReference(secretMaterial)) ||
          httpDispatches.some((dispatch) =>
            [
              ...dispatch.expandablePayload.matchAll(
                /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g,
              ),
            ].some(
              (match) =>
                !Object.prototype.hasOwnProperty.call(
                  effectiveEnvironment,
                  match[1] ?? match[2],
                ),
            ),
          ) ||
          httpDispatches.some((dispatch) => dispatch.opaquePayload))
      ) {
        runDataflowUnknownEvents[index] = stepReachability.events;
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "The HTTP request body or another command has unresolved input/secret flow; only direct payload references are findings.",
        });
      }
      const hasUntrustedSink = sinkMatches.length > 0;
      const fetchedMatches =
        stepUsesAiAction &&
        pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION
          ? selfFetchedSources(
              effectiveWith,
              stepReachability.events,
              creationOnlyEvents,
            ).filter(
              (match) =>
                !sourceTrustedByGate(
                  match.source,
                  match.event,
                  stepActorGate,
                  stepPrGate,
                  creationOnlyEvents,
                ),
            )
          : [];
      const runMatches =
        stepRun.trim().length > 0
          ? activeMatches(materializeInputs(stepRun, context.inputValues))
          : [];
      if (runMatches.length > 0) {
        untrustedRunPaths.push({
          events: unionEvents(
            runMatches.flatMap((match) =>
              match.event === "*" ? stepReachability.events : [match.event],
            ),
          ),
          uncertainEvents: stepUncertainEvents,
        });
      }
      const hasUntrustedIngestion =
        hasUntrustedSink || fetchedMatches.length > 0;
      if (httpOnly && hasUntrustedIngestion) {
        output.diagnostics.push({
          code: "agentci/analysis-remote-agent-capability-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "The HTTP request reaches a hosted agent, but this job's GITHUB_TOKEN permissions do not establish the remote agent's repository write capability.",
        });
      }
      const potentialAppWrite =
        isSelfGatingAgentAction(actionReference) &&
        permissionLevel(jobPermissions, "id-token") === "write" &&
        (!isRecord(effectiveWith) ||
          String(effectiveWith.github_token ?? "").trim().length === 0);
      const selfGated =
        isSelfGatingAgentAction(actionReference) &&
        !hasAgentGateBypass(rawStep.with);
      const verifiedSelfGate =
        selfGated &&
        VERIFIED_ANTHROPIC_WRITE_GATES.has(pinnedAnthropicRef ?? "");
      const ungatedIngestionEvents = unionEvents(
        [...sinkMatches, ...fetchedMatches].flatMap((match) => {
          const events =
            match.event === "*" ? stepReachability.events : [match.event];
          return events.filter(
            (event) =>
              !verifiedSelfGate ||
              !SELF_GATED_EVENTS.has(event) ||
              sourceMayDifferFromTriggerActor(
                match.source,
                event,
                creationOnlyEvents,
              ),
          );
        }),
      );
      const knownAgentModeWithoutImplicitFetch =
        pinnedAnthropicRef === ANTHROPIC_ACTION_AGENT_PROMPT_VERIFIED &&
        isRecord(effectiveWith) &&
        String(effectiveWith.prompt ?? "").length > 0 &&
        !/^\$\{\{[\s\S]*\}\}$/.test(String(effectiveWith.prompt)) &&
        String(effectiveWith.track_progress ?? "") !== "true" &&
        !String(effectiveWith.track_progress ?? "").includes("${{");
      const implicitIngestionUnknown =
        stepUsesAiAction &&
        pinnedAnthropicRef !== ANTHROPIC_ACTION_WITHOUT_DISCUSSION &&
        !knownAgentModeWithoutImplicitFetch &&
        stepReachability.events.some((event) => UNTRUSTED_EVENTS.has(event)) &&
        (hasSensitiveWrite(jobPermissions) || potentialAppWrite);
      if (implicitIngestionUnknown) {
        output.diagnostics.push({
          code: "agentci/analysis-agent-implicit-ingestion-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message:
            "This AI Action ref/event has no verified contract for implicit Issue, PR, or comment ingestion; explicit input flow is analyzed separately.",
        });
      }
      const ingestionEvents = unionEvents(
        [...sinkMatches, ...fetchedMatches].flatMap((match) =>
          match.event === "*" ? stepReachability.events : [match.event],
        ),
      );
      const hasSecret = httpOnly
        ? containsSecretReference(secretMaterial)
        : containsSecretReference(JSON.stringify(effectiveEnvironment)) ||
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
        const mayFetchIssue = Boolean(
          (hasSensitiveWrite(jobPermissions) || potentialAppWrite) &&
          (potentialAppWrite ||
            ["GH_TOKEN", "GITHUB_TOKEN"].some((name) =>
              String(effectiveEnvironment[name] ?? "").trim(),
            ) ||
            (isRecord(effectiveWith) &&
              String(effectiveWith.github_token ?? "").trim())) &&
          mayFetchIssueViaTool(actionReference, effectiveWith),
        );
        const toolFetchUnknownEvents = mayFetchIssue
          ? ["issues", "issue_comment"].filter(
              (event) =>
                stepReachability.events.includes(event) &&
                !sourceTrustedByGate(
                  "issue",
                  event,
                  stepActorGate || verifiedSelfGate,
                  stepPrGate,
                  creationOnlyEvents,
                ),
            )
          : [];
        if (toolFetchUnknownEvents.length > 0) {
          output.diagnostics.push({
            code: "agentci/analysis-agent-tool-fetch-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message:
              "The agent may read an untrusted Issue body with its permitted gh issue tool and a token, but static analysis cannot prove the tool was called.",
          });
        }
        output.agentUsages.push({
          id: [file, jobName, index, context.callChain.join(">")].join(":"),
          file,
          job: jobName,
          step: stepName,
          step_index: index,
          kind: httpOnly
            ? "http"
            : stepRun.trim().length > 0
              ? "cli"
              : stepUses.length > 0
                ? "action"
                : "other",
          evidence: shrink(
            cliCommands || httpCommands || stepUses || materialized,
          ),
          line: stepLine,
          reachable_events: stepReachability.events,
          uncertain_reachable_events: stepUncertainEvents.length
            ? stepUncertainEvents
            : undefined,
          call_chain:
            context.callChain.length > 0 ? context.callChain : undefined,
        });
        aiSteps.push({
          hasSecret,
          hasUntrustedIngestion,
          remoteHttp: httpOnly,
          ungatedIngestionEvents,
          ingestionEvents,
          potentialAppWrite,
          implicitIngestionUnknown,
          toolFetchUnknownEvents,
          actorGated: stepActorGate,
          events: stepReachability.events,
          uncertainEvents: stepUncertainEvents,
        });
        if (hasUntrustedSink) {
          output.findings.push(
            makeFinding("agentci/untrusted-input-in-prompt", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: shrink(sinkMaterial),
              line: stepLine,
              events: unionEvents(
                sinkMatches.flatMap((match) =>
                  match.event === "*" ? stepReachability.events : [match.event],
                ),
              ),
              uncertainEvents: stepUncertainEvents,
              callChain: context.callChain,
            }),
          );
        }
        if (stepUsesAiCli || containsShellAccess(effectiveWith)) {
          output.findings.push(
            makeFinding("agentci/ai-shell-access", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: stepUsesAiCli
                ? `AI CLI executes through run: ${shrink(stepRun)}`
                : shrink(JSON.stringify(effectiveWith)),
              line: stepLine,
              events: stepReachability.events,
              uncertainEvents: stepUncertainEvents,
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
              uncertainEvents: stepUncertainEvents,
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
              events: ["pull_request_target"],
              uncertainEvents: stepUncertainEvents,
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
            step_index: index,
            line: stepLine,
            message:
              "The checkout step requests pull-request code, but its ref does not identify whether GitHub's built-in unsafe-PR protection is present.",
          });
        }
      }
    }

    if (aiSteps.length === 0) continue;
    const jobHasWrite = hasSensitiveWrite(jobPermissions);
    // Same gate contract as the other reachability rules: a recognized actor
    // gate on the job or on the agent step itself means no untrusted actor can
    // reach that agent, even on pull_request_target. Unguarded steps in the
    // same job (an unsafe checkout, another agent) are judged on their own.
    const prTargetSteps = aiSteps.filter(
      (step) => !step.actorGated && step.events.includes("pull_request_target"),
    );
    const ingesting = aiSteps.filter(
      (step) =>
        step.hasUntrustedIngestion &&
        !step.remoteHttp &&
        step.ingestionEvents.some((event) => UNTRUSTED_EVENTS.has(event)) &&
        (jobHasWrite || step.potentialAppWrite),
    );
    if (prTargetSteps.length > 0) {
      output.findings.push(
        makeFinding("agentci/pull-request-target-ai", {
          file,
          job: jobName,
          evidence: "AI usage is reachable on pull_request_target",
          line: jobLine,
          events: ["pull_request_target"],
          uncertainEvents: uncertainWitnessEvents(
            ["pull_request_target"],
            prTargetSteps,
          ),
          callChain: context.callChain,
        }),
      );
    }
    if (ingesting.length > 0) {
      const reachableUntrusted = unionEvents(
        ingesting.flatMap((step) => step.ingestionEvents),
      ).filter((event) => UNTRUSTED_EVENTS.has(event));
      const criticalEvents = reachableUntrusted.filter(
        (event) =>
          ingesting.some((step) =>
            step.ungatedIngestionEvents.includes(event),
          ) || untrustedRunPaths.some((run) => run.events.includes(event)),
      );
      // An unresolved input path affects only the event on which it can run.
      const unknownEvents = reachableUntrusted.filter(
        (event) =>
          aiSteps.some(
            (step) =>
              (step.implicitIngestionUnknown && step.events.includes(event)) ||
              step.toolFetchUnknownEvents.includes(event),
          ) ||
          runDataflowUnknownEvents.some((events) => events.includes(event)),
      );
      const gatedEvents = reachableUntrusted.filter(
        (event) =>
          !criticalEvents.includes(event) && !unknownEvents.includes(event),
      );
      for (const [rule, events] of [
        ["agentci/untrusted-ai-write-token", criticalEvents],
        ["agentci/gated-ai-write-token", gatedEvents],
      ] as const) {
        if (events.length === 0) continue;
        const gated = rule === "agentci/gated-ai-write-token";
        output.findings.push(
          makeFinding(rule, {
            file,
            job: jobName,
            evidence: gated
              ? "actor-authored event content + AI usage + effective write permission; anthropics/claude-code-action normally checks the triggering actor for repository write access, with no configured allowlist bypass or untrusted run: expansion"
              : "reachable untrusted event content + AI usage + workflow or potential Action App write capability",
            line: jobLine,
            events,
            uncertainEvents: gated
              ? uncertainWitnessEvents(
                  events,
                  ingesting.map((step) => ({
                    events: step.ingestionEvents,
                    uncertainEvents: step.uncertainEvents,
                  })),
                )
              : events.filter(
                  (event) =>
                    !ingesting.some(
                      (step) =>
                        step.ungatedIngestionEvents.includes(event) &&
                        !step.uncertainEvents.includes(event),
                    ) &&
                    !(
                      untrustedRunPaths.some(
                        (run) =>
                          run.events.includes(event) &&
                          !run.uncertainEvents.includes(event),
                      ) &&
                      ingesting.some(
                        (step) =>
                          step.ingestionEvents.includes(event) &&
                          !step.uncertainEvents.includes(event),
                      )
                    ),
                ),
            callChain: context.callChain,
          }),
        );
      }
    }
    const secretSteps = aiSteps.filter((step) => step.hasSecret);
    if (secretSteps.length > 0) {
      const events = unionEvents(secretSteps.flatMap((step) => step.events));
      output.findings.push(
        makeFinding("agentci/ai-with-secrets", {
          file,
          job: jobName,
          evidence:
            "AI step's effective environment or inputs reference a secret/token",
          line: jobLine,
          events,
          uncertainEvents: uncertainWitnessEvents(events, secretSteps),
          callChain: context.callChain,
        }),
      );
    }
    if (jobHasWrite) {
      const events = unionEvents(aiSteps.flatMap((step) => step.events));
      output.findings.push(
        makeFinding("agentci/broad-write-permissions", {
          file,
          job: jobName,
          evidence: `effective permissions: ${describePermissions(jobPermissions)}`,
          line: jobLine,
          events,
          uncertainEvents: uncertainWitnessEvents(events, aiSteps),
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
  uncertainEvents: string[],
  creationOnlyEvents: string[],
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

  const matrixMaterial = isRecord(rawJob.strategy)
    ? JSON.stringify(rawJob.strategy.matrix ?? "")
    : "";
  // shortcut: dynamic caller matrices are opaque across a reusable boundary; upgrade with member-level provenance.
  const matrixEvents = matrixMaterial.includes("${{") ? events : [];
  const inputUnknownEvents = Object.fromEntries(
    Object.entries(isRecord(rawJob.with) ? rawJob.with : {})
      .map(([name, value]) => {
        const material = String(value ?? "");
        const parentEvents = outputContextReferences(
          material,
          "inputs",
        ).flatMap(({ id }) =>
          id === null
            ? Object.values(context.inputUnknownEvents ?? {}).flat()
            : (context.inputUnknownEvents?.[id] ?? []),
        );
        return [
          name,
          unionEvents([
            ...(outputContextReferences(material, "matrix").length
              ? matrixEvents
              : []),
            ...parentEvents,
          ]).filter((event) => events.includes(event)),
        ] as const;
      })
      .filter(([, uncertain]) => uncertain.length > 0),
  );

  return analyzeWorkflow(target, repository, {
    events,
    uncertainEvents,
    triggerSource: context.triggerSource,
    creationOnlyEvents,
    actorGate: Boolean(context.actorGate) || hasTrustedActorGate(rawJob.if),
    prGate: Boolean(context.prGate) || hasTrustedPrProvenanceGate(rawJob.if),
    permissionCeiling: permissions,
    inputValues: toStringMap(rawJob.with, context.inputValues),
    inputUnknownEvents,
    stack: [...context.stack, path.resolve(caller.path), targetPath],
    callChain: [...context.callChain, `${callerFile}#${jobName}`],
  });
}

function makeFinding(ruleId: string, context: FindingContext): Finding {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
  const chain = context.callChain?.join(">") ?? "";
  const id = `${ruleId}:${context.file}:${context.job ?? ""}:${context.stepIndex ?? ""}:${chain}`;
  const uncertainEvents = context.events?.filter((event) =>
    context.uncertainEvents?.includes(event),
  );
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
    uncertain_reachable_events: uncertainEvents?.length
      ? uncertainEvents
      : undefined,
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

function outputContextReferences(
  material: string,
  context: "steps" | "needs" | "matrix" | "inputs",
): Array<{ id: string | null; output: string | null }> {
  const expressions: string[] = [];
  let cursor = 0;
  while (true) {
    const start = material.indexOf("${{", cursor);
    if (start < 0) break;
    const end = githubExpressionEnd(material, start);
    if (end < 0) break;
    expressions.push(material.slice(start + 3, end - 2));
    cursor = end;
  }
  return expressions.flatMap((rawExpression) => {
    const expression = rawExpression
      .replace(/\\"/g, '"')
      .replace(/\[\s*['"]([A-Za-z_][\w-]*)['"]\s*\]/g, ".$1")
      .replace(/'(?:[^']|'')*'/g, (literal) => " ".repeat(literal.length));
    const direct: Array<{ id: string | null; output: string | null }> = [
      ...expression.matchAll(
        new RegExp(
          `\\b${context}\\.([A-Za-z_][\\w-]*)\\.outputs(?:\\.([A-Za-z_][\\w-]*))?\\b`,
          "g",
        ),
      ),
    ].map((reference) => ({
      id: reference[1],
      output: reference[2] ?? null,
    }));
    for (const reference of expression.matchAll(
      new RegExp(
        `(?:^|[^\\w.])${context}\\.([A-Za-z_][\\w-]*)\\b${context === "matrix" ? "" : "(?!\\s*(?:\\.|\\[))"}`,
        "g",
      ),
    )) {
      direct.push({ id: reference[1], output: null });
    }
    if (
      new RegExp(`(?:^|[^\\w.])${context}\\b(?!\\s*(?:\\.|\\[))`).test(
        expression,
      )
    ) {
      direct.push({ id: null, output: null });
    }
    if (new RegExp(`(?:^|[^\\w.])${context}\\.\\*`).test(expression)) {
      direct.push({ id: null, output: null });
    }
    if (
      new RegExp(`\\b${context}(?:\\.[\\w-]+)?\\s*\\[\\s*[^'"]`).test(
        expression,
      )
    ) {
      direct.push({ id: null, output: null });
    }
    return direct;
  });
}

type ContextSource =
  | ReturnType<typeof untrustedGitHubContextMatches>[number]["source"]
  | "history"
  | "pr_head_content";

function creationOnlyTriggers(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return Object.entries(raw)
    .filter(([event, settings]) => {
      const creation = event === "discussion" ? "created" : "opened";
      return (
        [
          "issues",
          "pull_request",
          "pull_request_target",
          "discussion",
        ].includes(event) &&
        isRecord(settings) &&
        Array.isArray(settings.types) &&
        settings.types.length === 1 &&
        settings.types[0] === creation
      );
    })
    .map(([event]) => event);
}

function sourceTrustedByGate(
  source: ContextSource,
  event: string,
  actorGate: boolean,
  prGate: boolean,
  creationOnlyEvents: Set<string>,
): boolean {
  if (source === "history") return false;
  if (source === "commit") return false;
  if (source === "pull_request") {
    return actorGate && creationOnlyEvents.has(event);
  }
  if (source === "pr_head_ref" || source === "pr_head_content") return prGate;
  if (source === "issue" || source === "discussion") {
    return actorGate && creationOnlyEvents.has(event);
  }
  return actorGate;
}

function sourceMayDifferFromTriggerActor(
  source: ContextSource,
  event: string,
  creationOnlyEvents: Set<string>,
): boolean {
  return (
    source === "history" ||
    source === "commit" ||
    source === "pr_head_ref" ||
    source === "pr_head_content" ||
    ((source === "issue" ||
      source === "pull_request" ||
      source === "discussion") &&
      !creationOnlyEvents.has(event))
  );
}

function selfFetchedSources(
  withBlock: unknown,
  events: string[],
  creationOnlyEvents: Set<string>,
): Array<{ event: string; source: ContextSource }> {
  const inputs = isRecord(withBlock) ? withBlock : {};
  const prompt = String(inputs.prompt ?? "");
  // A lone unresolved expression can evaluate to empty and select tag mode.
  const hasPrompt = prompt.length > 0 && !/^\$\{\{[\s\S]*\}\}$/.test(prompt);
  const progress = String(inputs.track_progress ?? "");
  const trackProgress = progress === "true" || progress.includes("${{");
  if (hasPrompt && !trackProgress) return [];
  const defaultTagEvents = new Set([
    "issues",
    "issue_comment",
    "pull_request_review",
    "pull_request_review_comment",
  ]);
  return events.flatMap(
    (event): Array<{ event: string; source: ContextSource }> => {
      if (!trackProgress && !defaultTagEvents.has(event)) return [];
      if (event === "issues" || event === "issue_comment") {
        return [
          { event, source: "issue" },
          // issue_comment can target a PR, whose changed-file paths are fetched too.
          ...(event === "issue_comment"
            ? [{ event, source: "pr_head_content" as const }]
            : []),
          ...(!creationOnlyEvents.has(event)
            ? [{ event, source: "history" as const }]
            : []),
        ];
      }
      if (
        [
          "pull_request",
          "pull_request_target",
          "pull_request_review",
          "pull_request_review_comment",
        ].includes(event)
      ) {
        return [
          { event, source: "pull_request" },
          { event, source: "pr_head_content" },
          ...(!creationOnlyEvents.has(event)
            ? [{ event, source: "history" as const }]
            : []),
        ];
      }
      return [];
    },
  );
}

function mayFetchIssueViaTool(uses: string, withBlock: unknown): boolean {
  if (!isSelfGatingAgentAction(uses) || !isRecord(withBlock)) return false;
  // shortcut: literal gh issue wildcard allowlists only; expand after new verified forms.
  return (
    /\$\{\{\s*github\.event\.issue\.number\b/i.test(
      String(withBlock.prompt ?? ""),
    ) &&
    /--allowedTools?[^\n]*Bash\(gh issue(?: view)?:\*\)/i.test(
      String(withBlock.claude_args ?? ""),
    )
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

function uncertainWitnessEvents(
  events: string[],
  witnesses: Array<{ events: string[]; uncertainEvents: string[] }>,
): string[] {
  return events.filter(
    (event) =>
      !witnesses.some(
        (witness) =>
          witness.events.includes(event) &&
          !witness.uncertainEvents.includes(event),
      ),
  );
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
    const key = `${diagnostic.code}:${diagnostic.file}:${diagnostic.job ?? ""}:${diagnostic.step_index ?? ""}:${diagnostic.line ?? ""}:${diagnostic.message}`;
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
