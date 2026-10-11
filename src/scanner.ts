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
  narrowEvents,
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
  callChain?: string[];
};
type AnalysisOutput = {
  agentUsages: AgentUsage[];
  findings: Finding[];
  diagnostics: Diagnostic[];
};
type ReusableContext = {
  events?: string[];
  creationOnlyEvents?: string[];
  actorGate?: boolean;
  prGate?: boolean;
  permissionCeiling?: EffectivePermissions;
  inputValues: Record<string, string>;
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
// Only these immutable revisions have an inspected triggering-actor write gate.
// Sources: https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/github/validation/permissions.ts
// https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md
const VERIFIED_ANTHROPIC_WRITE_GATES = new Set([
  "787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251",
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
    analysis_complete: diagnostics.length === 0,
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
    const jobReachability = narrowEvents(workflowEvents, rawJob.if);
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
          [...creationOnlyEvents],
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
      hasUntrustedIngestion: boolean;
      remoteHttp: boolean;
      sourceMayDifferFromTrigger: boolean;
      potentialAppWrite: boolean;
      ingestionEvents: string[];
      /** anthropics/claude-code-action with its default write-access gate intact. */
      selfGated: boolean;
      /** The job or this step carries a recognized actor/provenance gate. */
      actorGated: boolean;
      events: string[];
    }> = [];
    /** Untrusted event text expanded into a `run:` step anywhere in the job. */
    let untrustedInRun = false;
    const secretEnvTransferEvents = new Set<string>();

    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord(rawStep)) continue;
      const stepName =
        typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
      const stepLine = locateStepLine(workflow.raw, jobName, index);
      let stepReachability = narrowEvents(jobReachability.events, rawStep.if);
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

      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const actionReference = materializeInputs(stepUses, context.inputValues);
      const pinnedAnthropicRef =
        /^anthropics\/claude-code-action@([0-9a-f]{40})$/i
          .exec(actionReference)?.[1]
          ?.toLowerCase();
      const discussionEvents = isSelfGatingAgentAction(actionReference)
        ? stepReachability.events.filter(
            (event) => event === "discussion" || event === "discussion_comment",
          )
        : [];
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
      const effectiveWith = materializeStructure(
        rawStep.with,
        context.inputValues,
      );
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
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
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
          line: stepLine,
          message:
            "An earlier step may write a secret to GITHUB_ENV; exposure to this AI step is not modeled.",
        });
      }
      if (
        /\bGITHUB_ENV\b/.test(materializedRun) &&
        (containsSecretReference(materializedRun) ||
          containsSecretReference(JSON.stringify(effectiveEnvironment)))
      ) {
        for (const event of stepReachability.events) {
          secretEnvTransferEvents.add(event);
        }
      }
      const stepActorGate = jobActorGate || hasTrustedActorGate(rawStep.if);
      const stepPrGate = jobPrGate || hasTrustedPrProvenanceGate(rawStep.if);
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
      const sinkMatches = activeMatches(sinkMaterial);
      if (
        stepUsesAiCli &&
        (cliInvocations.some(
          (invocation) =>
            invocation.opaqueInput ||
            activeMatches(invocation.pipedInput).length > 0,
        ) ||
          (activeMatches(materializedRun).length > 0 &&
            [
              ...cliExpandableCommands.matchAll(
                /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g,
              ),
            ].some(
              (match) =>
                !Object.prototype.hasOwnProperty.call(
                  effectiveEnvironment,
                  match[1] ?? match[2],
                ),
            )) ||
          (activeMatches(JSON.stringify(effectiveEnvironment)).length > 0 &&
            activeMatches(JSON.stringify(cliEnvironment)).length === 0))
      ) {
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
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
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          line: stepLine,
          message:
            "The HTTP request body or another command has unresolved input/secret flow; only direct payload references are findings.",
        });
      }
      const hasUntrustedSink = sinkMatches.length > 0;
      const fetchedMatches = stepUsesAiAction
        ? selfFetchedSources(
            materializeInputs(stepUses, context.inputValues),
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
      if (
        stepRun.trim().length > 0 &&
        activeMatches(materializeInputs(stepRun, context.inputValues)).length >
          0
      ) {
        untrustedInRun = true;
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
      const ingestionEvents = unionEvents(
        [...sinkMatches, ...fetchedMatches].flatMap((match) =>
          match.event === "*" ? stepReachability.events : [match.event],
        ),
      );
      const sourceMayDifferFromTrigger = [
        ...sinkMatches,
        ...fetchedMatches,
      ].some((match) =>
        sourceMayDifferFromTriggerActor(
          match.source,
          match.event,
          creationOnlyEvents,
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
        if (
          !hasUntrustedIngestion &&
          ["issues", "issue_comment"].some(
            (event) =>
              stepReachability.events.includes(event) &&
              !sourceTrustedByGate(
                "issue",
                event,
                stepActorGate || verifiedSelfGate,
                stepPrGate,
                creationOnlyEvents,
              ),
          ) &&
          (hasSensitiveWrite(jobPermissions) || potentialAppWrite) &&
          (potentialAppWrite ||
            ["GH_TOKEN", "GITHUB_TOKEN"].some((name) =>
              String(effectiveEnvironment[name] ?? "").trim(),
            ) ||
            (isRecord(effectiveWith) &&
              String(effectiveWith.github_token ?? "").trim())) &&
          mayFetchIssueViaTool(actionReference, effectiveWith)
        ) {
          output.diagnostics.push({
            code: "agentci/analysis-agent-tool-fetch-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
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
          call_chain:
            context.callChain.length > 0 ? context.callChain : undefined,
        });
        aiSteps.push({
          hasSecret,
          hasUntrustedSink,
          hasUntrustedIngestion,
          remoteHttp: httpOnly,
          sourceMayDifferFromTrigger,
          ingestionEvents,
          potentialAppWrite,
          selfGated,
          actorGated: stepActorGate,
          events: stepReachability.events,
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
    // Same gate contract as the other reachability rules: a recognized actor
    // gate on the job or on the agent step itself means no untrusted actor can
    // reach that agent, even on pull_request_target. Unguarded steps in the
    // same job (an unsafe checkout, another agent) are judged on their own.
    const aiOnPullRequestTarget = aiSteps.some(
      (step) => !step.actorGated && step.events.includes("pull_request_target"),
    );
    const ingesting = aiSteps.filter(
      (step) =>
        step.hasUntrustedIngestion &&
        !step.remoteHttp &&
        step.ingestionEvents.some((event) => UNTRUSTED_EVENTS.has(event)) &&
        (jobHasWrite || step.potentialAppWrite),
    );
    const untrustedViaInterpolation = ingesting.some(
      (step) => step.hasUntrustedSink,
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
    if (ingesting.length > 0) {
      const reachableUntrusted = unionEvents(
        ingesting.flatMap((step) => step.ingestionEvents),
      ).filter((event) => UNTRUSTED_EVENTS.has(event));
      // Downgrade to high only when every ingesting step is the self-gating
      // action with its gate intact, every reachable untrusted event is one the
      // action's docs say it checks, no parent content may have a different
      // author, and no run: step expands untrusted text outside that gate.
      const gated =
        ingesting.every((step) => step.selfGated) &&
        reachableUntrusted.every((event) => SELF_GATED_EVENTS.has(event)) &&
        !ingesting.some((step) => step.sourceMayDifferFromTrigger) &&
        !untrustedInRun;
      output.findings.push(
        makeFinding(
          gated
            ? "agentci/gated-ai-write-token"
            : "agentci/untrusted-ai-write-token",
          {
            file,
            job: jobName,
            evidence: gated
              ? "actor-authored event content + AI usage + effective write permission; anthropics/claude-code-action normally checks the triggering actor for repository write access, with no configured allowlist bypass or untrusted run: expansion"
              : untrustedViaInterpolation
                ? "reachable untrusted event content + AI usage + workflow or potential Action App write capability"
                : "AI agent action may ingest reachable event content through its runtime context + workflow or potential Action App write capability",
            line: jobLine,
            events: reachableUntrusted,
            callChain: context.callChain,
          },
        ),
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

  return analyzeWorkflow(target, repository, {
    events,
    creationOnlyEvents,
    actorGate: Boolean(context.actorGate) || hasTrustedActorGate(rawJob.if),
    prGate: Boolean(context.prGate) || hasTrustedPrProvenanceGate(rawJob.if),
    permissionCeiling: permissions,
    inputValues: toStringMap(rawJob.with, context.inputValues),
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
  uses: string,
  withBlock: unknown,
  events: string[],
  creationOnlyEvents: Set<string>,
): Array<{ event: string; source: ContextSource }> {
  if (/^anthropics\/claude-code-base-action(?:@|$)/i.test(uses)) return [];
  if (!isSelfGatingAgentAction(uses)) {
    return events
      .filter((event) => UNTRUSTED_EVENTS.has(event))
      .map((event) => ({ event, source: "other" }));
  }
  const inputs = isRecord(withBlock) ? withBlock : {};
  const prompt = String(inputs.prompt ?? "").trim();
  // A lone unresolved expression can evaluate to empty and select tag mode.
  const hasPrompt = prompt.length > 0 && !/^\$\{\{[\s\S]*\}\}$/.test(prompt);
  const trackProgress =
    inputs.track_progress !== undefined &&
    ![false, "false", ""].includes(inputs.track_progress as string | boolean);
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
