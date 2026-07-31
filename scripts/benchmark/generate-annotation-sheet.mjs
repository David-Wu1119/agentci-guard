#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { renderCsv } from "./csv.mjs";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, "benchmark", "manifest.json"),
    "utf8",
  ),
);
const outputPath = path.join(
  repositoryRoot,
  "benchmark",
  "annotation-sheet.csv",
);
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
const jobTasks = manifest.rules.filter(
  (rule) => manifest.task_granularity[rule] === "job",
);
const stepTasks = [
  manifest.agent_detection_task,
  ...manifest.rules.filter(
    (rule) => manifest.task_granularity[rule] === "step",
  ),
];

for (const item of manifest.cases) {
  const snapshot = path.join(repositoryRoot, item.snapshot_path);
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
}

const rendered = renderCsv(rows);
const mode = process.argv[2] ?? "--check";
if (mode === "--write") {
  fs.writeFileSync(outputPath, rendered);
  console.log(`Wrote ${rows.length - 1} annotation units to ${outputPath}.`);
} else if (mode === "--check") {
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";
  if (existing !== rendered) {
    console.error(
      "benchmark/annotation-sheet.csv is stale; run node scripts/benchmark/generate-annotation-sheet.mjs --write",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Verified ${rows.length - 1} deterministic annotation units without consulting scanner predictions.`,
    );
  }
} else {
  throw new Error("Expected --check or --write.");
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
