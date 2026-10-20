#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { renderCsv } from "./csv.mjs";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const [mode = "--check", manifestArgument, outputArgument, ...extra] =
  process.argv.slice(2);
if (
  !["--check", "--write"].includes(mode) ||
  extra.length > 0 ||
  Boolean(manifestArgument) !== Boolean(outputArgument)
) {
  throw new Error(
    "Usage: generate-annotation-sheet.mjs [--check|--write] [manifest.json annotation-sheet.csv]",
  );
}
const frozenOutputPath = path.join(
  repositoryRoot,
  "benchmark",
  "annotation-sheet.csv",
);
const outputPath = outputArgument
  ? path.resolve(outputArgument)
  : frozenOutputPath;
if (manifestArgument && outputPath === frozenOutputPath) {
  throw new Error("Refusing to overwrite the frozen v3 annotation registry.");
}
const manifestPath = manifestArgument
  ? path.resolve(manifestArgument)
  : path.join(repositoryRoot, "benchmark", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifestArgument) {
  const frozenCandidate =
    manifest.pilot_id === "agentci-nine-rule-candidate-dev-micro-pilot-v1";
  const currentRules = frozenCandidate
    ? manifest.rules
    : Object.keys((await import("../../dist/index.js")).RULES);
  if (
    !Array.isArray(manifest.rules) ||
    manifest.rules.length !== currentRules.length ||
    currentRules.some((rule) => !manifest.rules.includes(rule))
  ) {
    throw new Error(
      "Custom manifest rule registry must match current scanner rules.",
    );
  }
  if (manifest.agent_detection_task !== "agentci/agent-usage") {
    throw new Error("Custom manifest has an invalid agent detection task.");
  }
  // Keep this candidate map frozen when later scanner rules or scopes change.
  const frozenCandidateRuleScopes = {
    "agentci/untrusted-ai-write-token": "job",
    "agentci/gated-ai-write-token": "job",
    "agentci/pull-request-target-ai": "job",
    "agentci/ai-with-secrets": "job",
    "agentci/untrusted-input-in-prompt": "step",
    "agentci/ai-shell-access": "step",
    "agentci/broad-write-permissions": "job",
    "agentci/unpinned-ai-action": "step",
    "agentci/unsafe-checkout": "step",
  };
  // Scanner rule metadata has no scope; update this live map for later rules.
  const currentRuleScopes = frozenCandidate
    ? frozenCandidateRuleScopes
    : { ...frozenCandidateRuleScopes };
  if (
    Object.keys(currentRuleScopes).length !== currentRules.length ||
    currentRules.some(
      (rule) => manifest.task_granularity?.[rule] !== currentRuleScopes[rule],
    )
  ) {
    throw new Error(
      "Custom manifest task granularity must match current rule scopes.",
    );
  }
}
const columns = [
  "unit_id",
  "case_id",
  "split",
  "stratum",
  "repository",
  "source_commit",
  "source_path",
  "scope",
  "job_id",
  "step_index",
  "step_name",
  "rule_id",
  "ground_truth",
  "reachability",
  "triggers",
  "permissions_status",
  "effective_permissions",
  "untrusted_source_status",
  "untrusted_source",
  "agent_sink_status",
  "agent_sink",
  "capability_status",
  "capability",
  "mitigation_status",
  "mitigation",
  "evidence_lines",
  "explanation",
  "notes",
];
const rows = [columns];
const allTasks = [manifest.agent_detection_task, ...manifest.rules];
if (
  new Set(allTasks).size !== allTasks.length ||
  Object.keys(manifest.task_granularity).length !== allTasks.length ||
  allTasks.some(
    (task) => !["job", "step"].includes(manifest.task_granularity[task]),
  ) ||
  manifest.task_granularity[manifest.agent_detection_task] !== "step"
) {
  throw new Error(
    "Manifest task granularity must cover each task exactly once.",
  );
}
const jobTasks = manifest.rules.filter(
  (rule) => manifest.task_granularity[rule] === "job",
);
const stepTasks = [
  manifest.agent_detection_task,
  ...manifest.rules.filter(
    (rule) => manifest.task_granularity[rule] === "step",
  ),
];

if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
  throw new Error("Manifest has zero annotation units: no cases.");
}

for (const item of manifest.cases) {
  const caseStart = rows.length;
  const snapshot = path.resolve(repositoryRoot, item.snapshot_path);
  const raw = fs.readFileSync(snapshot, "utf8");
  const document = YAML.parseDocument(raw, { prettyErrors: true });
  const parsed = document.errors.length === 0 ? document.toJS() : undefined;
  if (!isRecord(parsed) || !isRecord(parsed.jobs)) {
    for (const task of allTasks) {
      rows.push(annotationRow(item, [], "workflow", null, null, null, task));
    }
    continue;
  }

  const triggers = normalizeTriggers(parsed.on ?? parsed["on"]);
  for (const [jobId, rawJob] of Object.entries(parsed.jobs)) {
    if (!isRecord(rawJob)) continue;
    for (const task of jobTasks) {
      rows.push(annotationRow(item, triggers, "job", jobId, null, null, task));
    }

    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    for (const [stepIndex, rawStep] of steps.entries()) {
      const stepName =
        isRecord(rawStep) && typeof rawStep.name === "string"
          ? rawStep.name
          : `step ${stepIndex + 1}`;
      for (const task of stepTasks) {
        rows.push(
          annotationRow(
            item,
            triggers,
            "step",
            jobId,
            stepIndex,
            stepName,
            task,
          ),
        );
      }
    }

    if (steps.length === 0 && typeof rawJob.uses === "string") {
      for (const task of stepTasks) {
        rows.push(
          annotationRow(
            item,
            triggers,
            "reusable-call",
            jobId,
            null,
            "reusable workflow call",
            task,
          ),
        );
      }
    }
  }
  if (rows.length === caseStart) {
    throw new Error(`Case ${item.case_id} has zero annotation units.`);
  }
}

const rendered = renderCsv(rows);
if (mode === "--write") {
  if (manifestArgument && fs.existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite existing registry ${outputPath}.`);
  }
  fs.writeFileSync(outputPath, rendered, {
    flag: manifestArgument ? "wx" : "w",
  });
  console.log(`Wrote ${rows.length - 1} annotation units to ${outputPath}.`);
} else if (mode === "--check") {
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";
  if (existing !== rendered) {
    console.error(
      `${outputPath} is stale; generate it with --write only before labels exist.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Verified ${rows.length - 1} deterministic annotation units without consulting scanner predictions.`,
    );
  }
}

function annotationRow(
  item,
  triggers,
  scope,
  jobId,
  stepIndex,
  stepName,
  task,
) {
  return [
    unitId(item.case_id, scope, jobId, stepIndex, task),
    item.case_id,
    item.split,
    item.stratum,
    item.repository,
    item.source_commit,
    item.source_path,
    scope,
    jobId ?? "",
    stepIndex ?? "",
    stepName ?? "",
    task,
    "",
    "",
    triggers.join(";"),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

function unitId(caseId, scope, jobId, stepIndex, task) {
  return [caseId, scope, jobId ?? "-", stepIndex ?? "-", task]
    .map((part) => encodeURIComponent(String(part)))
    .join("|");
}

function normalizeTriggers(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map(String).sort();
  if (isRecord(value)) return Object.keys(value).sort();
  return [];
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
