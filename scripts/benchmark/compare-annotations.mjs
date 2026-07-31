#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  decisionsEqual,
  readJsonLines,
  validateAnnotationSet,
} from "./annotation-lib.mjs";
import { renderCsv } from "./csv.mjs";

const [primaryArgument, reviewerArgument, outputArgument, ...options] =
  process.argv.slice(2);
if (!primaryArgument || !reviewerArgument || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/compare-annotations.mjs <primary.jsonl> <reviewer.jsonl> <disagreements.csv> [--coverage formal|pilot] [--review-mode independent|test-retest]",
  );
}
const { coverage, reviewMode } = parseOptions(options);
if (reviewMode === "test-retest" && coverage !== "pilot") {
  throw new Error(
    "--review-mode test-retest is currently supported only with --coverage pilot.",
  );
}
const primaryRegistry =
  coverage === "pilot" ? "pilot/annotation-sheet.csv" : "annotation-sheet.csv";
const reviewerRegistry =
  coverage === "pilot" ? "pilot/annotation-sheet.csv" : "review-sheet.csv";
const primaryRecords = readJsonLines(path.resolve(primaryArgument));
const reviewerRecords = readJsonLines(path.resolve(reviewerArgument));
const primary = validateAnnotationSet(primaryRecords, {
  registryName: primaryRegistry,
  role: reviewMode === "test-retest" ? "test-retest pass 1" : "independent",
});
const reviewer = validateAnnotationSet(reviewerRecords, {
  registryName: reviewerRegistry,
  role: reviewMode === "test-retest" ? "test-retest pass 2" : "independent",
});
if (reviewMode === "independent" && primary.annotator === reviewer.annotator) {
  throw new Error("Independent label files must use different annotators.");
}
if (reviewMode === "test-retest" && primary.annotator !== reviewer.annotator) {
  throw new Error(
    "Test-retest label files must use the same stable annotator pseudonym.",
  );
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
    "review_mode",
    "source_a_role",
    "annotator_a",
    "a_ground_truth",
    "a_reachability",
    "source_b_role",
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
    reviewMode,
    reviewMode === "test-retest" ? "pass-1" : "primary",
    left.annotator,
    left.ground_truth,
    left.reachability,
    reviewMode === "test-retest" ? "pass-2" : "independent-review",
    right.annotator,
    right.ground_truth,
    right.reachability,
    ...decisionColumns.map(() => ""),
  ]);
}

fs.writeFileSync(path.resolve(outputArgument), renderCsv(rows));
const overlap = reviewer.registry.size;
const coverageLabel =
  reviewMode === "test-retest" ? "Test-retest" : "Independent review";
const resolutionLabel =
  reviewMode === "test-retest" ? "resolution" : "adjudication";
console.log(
  [
    `${coverageLabel} coverage ${overlap}/${primary.registry.size} (${percent(overlap / primary.registry.size)}).`,
    `Ground-truth agreement ${groundTruthAgreements}/${overlap} (${percent(groundTruthAgreements / overlap)}).`,
    `Categorical-dimension agreement ${exactAgreements}/${overlap} (${percent(exactAgreements / overlap)}).`,
    `${rows.length - 1} disagreement(s) require ${resolutionLabel}.`,
  ].join(" "),
);

function parseOptions(values) {
  const parsed = {
    coverage: "formal",
    reviewMode: "independent",
  };
  const seen = new Set();
  for (let index = 0; index < values.length; index += 2) {
    const option = values[index];
    const value = values[index + 1];
    if (!option || !value || seen.has(option)) {
      throw new Error(
        "Options must be unique --coverage <formal|pilot> or --review-mode <independent|test-retest> pairs.",
      );
    }
    seen.add(option);
    if (option === "--coverage") parsed.coverage = value;
    else if (option === "--review-mode") parsed.reviewMode = value;
    else throw new Error(`Unknown option ${option}.`);
  }
  if (!["formal", "pilot"].includes(parsed.coverage)) {
    throw new Error("--coverage must be formal or pilot.");
  }
  if (!["independent", "test-retest"].includes(parsed.reviewMode)) {
    throw new Error("--review-mode must be independent or test-retest.");
  }
  return parsed;
}

function percent(value) {
  return `${(100 * value).toFixed(1)}%`;
}
