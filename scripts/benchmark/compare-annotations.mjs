#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  decisionsEqual,
  readJsonLines,
  validateAnnotationSet,
} from "./annotation-lib.mjs";
import { renderCsv } from "./csv.mjs";

const [primaryArgument, reviewerArgument, outputArgument] =
  process.argv.slice(2);
if (!primaryArgument || !reviewerArgument || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/compare-annotations.mjs <primary.jsonl> <reviewer.jsonl> <disagreements.csv>",
  );
}
const primaryRecords = readJsonLines(path.resolve(primaryArgument));
const reviewerRecords = readJsonLines(path.resolve(reviewerArgument));
const primary = validateAnnotationSet(primaryRecords, {
  registryName: "annotation-sheet.csv",
  role: "independent",
});
const reviewer = validateAnnotationSet(reviewerRecords, {
  registryName: "review-sheet.csv",
  role: "independent",
});
if (primary.annotator === reviewer.annotator) {
  throw new Error("Independent label files must use different annotators.");
}

const metadataColumns = [
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
];
const decisionColumns = [
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
const rows = [
  [
    ...metadataColumns,
    "annotator_a",
    "a_ground_truth",
    "a_reachability",
    "annotator_b",
    "b_ground_truth",
    "b_reachability",
    ...decisionColumns,
  ],
];
let groundTruthAgreements = 0;
let exactAgreements = 0;

for (const registry of reviewer.registryRows) {
  const left = primary.recordsByUnit.get(registry.unit_id);
  const right = reviewer.recordsByUnit.get(registry.unit_id);
  if (!left || !right) {
    throw new Error(`Missing overlap record ${registry.unit_id}.`);
  }
  if (left.ground_truth === right.ground_truth) groundTruthAgreements++;
  if (decisionsEqual(left, right)) {
    exactAgreements++;
    continue;
  }
  rows.push([
    ...metadataColumns.map((column) => registry[column] ?? ""),
    left.annotator,
    left.ground_truth,
    left.reachability,
    right.annotator,
    right.ground_truth,
    right.reachability,
    ...decisionColumns.map(() => ""),
  ]);
}

fs.writeFileSync(path.resolve(outputArgument), renderCsv(rows));
const overlap = reviewer.registry.size;
console.log(
  [
    `Independent review coverage ${overlap}/${primary.registry.size} (${percent(overlap / primary.registry.size)}).`,
    `Ground-truth agreement ${groundTruthAgreements}/${overlap} (${percent(groundTruthAgreements / overlap)}).`,
    `Categorical-dimension agreement ${exactAgreements}/${overlap} (${percent(exactAgreements / overlap)}).`,
    `${rows.length - 1} disagreement(s) require adjudication.`,
  ].join(" "),
);

function percent(value) {
  return `${(100 * value).toFixed(1)}%`;
}
