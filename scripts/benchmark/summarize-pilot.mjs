#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  decisionsEqual,
  readJsonLines,
  validateAnnotationSet,
} from "./annotation-lib.mjs";
import { csvObjects } from "./csv.mjs";

const [
  timingAArgument,
  timingBArgument,
  labelsAArgument,
  labelsBArgument,
  outputArgument,
] = process.argv.slice(2);
if (
  !timingAArgument ||
  !timingBArgument ||
  !labelsAArgument ||
  !labelsBArgument ||
  !outputArgument
) {
  throw new Error(
    "Usage: node scripts/benchmark/summarize-pilot.mjs <timing-a.csv> <timing-b.csv> <labels-a.jsonl> <labels-b.jsonl> <summary.json>",
  );
}

const pilotRoot = path.resolve("benchmark/pilot");
const pilotManifest = JSON.parse(
  fs.readFileSync(path.join(pilotRoot, "manifest.json"), "utf8"),
);
const labelsA = validateAnnotationSet(
  readJsonLines(path.resolve(labelsAArgument)),
  {
    registryName: "pilot/annotation-sheet.csv",
    role: "independent",
  },
);
const labelsB = validateAnnotationSet(
  readJsonLines(path.resolve(labelsBArgument)),
  {
    registryName: "pilot/annotation-sheet.csv",
    role: "independent",
  },
);
if (labelsA.annotator === labelsB.annotator) {
  throw new Error("Pilot label files must use different human pseudonyms.");
}

const timingA = validateTiming(
  path.resolve(timingAArgument),
  labelsA.annotator,
);
const timingB = validateTiming(
  path.resolve(timingBArgument),
  labelsB.annotator,
);
const agreement = annotationAgreement(labelsA, labelsB);
const fullRegistry = csvObjects(
  fs.readFileSync("benchmark/annotation-sheet.csv", "utf8"),
);
const reviewRegistry = csvObjects(
  fs.readFileSync("benchmark/review-sheet.csv", "utf8"),
);
const primaryHours = projectedHours(
  fullRegistry.length,
  pilotManifest.annotation_unit_count,
  timingA.activeMinutes,
);
const reviewerHours = projectedHours(
  reviewRegistry.length,
  pilotManifest.annotation_unit_count,
  timingB.activeMinutes,
);
const report = {
  schema_version: 1,
  pilot_id: pilotManifest.pilot_id,
  status: "complete",
  purpose:
    "Annotation feasibility and agreement only; these development labels are not benchmark accuracy evidence.",
  cases: pilotManifest.case_count,
  annotation_units_per_annotator: pilotManifest.annotation_unit_count,
  annotators: [
    timingReport(labelsA.annotator, timingA, fullRegistry.length),
    timingReport(labelsB.annotator, timingB, reviewRegistry.length),
  ],
  agreement,
  projected_formal_annotation_hours: {
    primary: primaryHours,
    independent_review: reviewerHours,
    combined_before_adjudication: primaryHours + reviewerHours,
    caution:
      "Projection is linear and excludes adjudication, breaks, coordination, and workflow-size distribution differences.",
  },
};
fs.writeFileSync(
  path.resolve(outputArgument),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  `Wrote pilot summary: ${pilotManifest.annotation_unit_count} units per annotator, ${(100 * agreement.ground_truth_exact_agreement).toFixed(1)}% ground-truth agreement, ${report.projected_formal_annotation_hours.combined_before_adjudication.toFixed(1)} projected combined active hours before adjudication.`,
);

function validateTiming(file, expectedAnnotator) {
  const rows = csvObjects(fs.readFileSync(file, "utf8"));
  const expectedCases = new Map(
    pilotManifest.cases.map((item) => [item.case_id, item]),
  );
  if (rows.length !== expectedCases.size) {
    throw new Error(
      `${file} has ${rows.length} timing rows; expected ${expectedCases.size}.`,
    );
  }
  const seen = new Set();
  let activeMinutes = 0;
  let interruptionMinutes = 0;
  for (const row of rows) {
    const item = expectedCases.get(row.case_id);
    if (!item || seen.has(row.case_id)) {
      throw new Error(`${file} contains an unexpected or duplicate case.`);
    }
    seen.add(row.case_id);
    if (
      row.stratum !== item.stratum ||
      Number(row.unit_count) !== item.annotation_unit_count
    ) {
      throw new Error(`${file}/${row.case_id}: pilot metadata drifted.`);
    }
    if (row.annotator_pseudonym.trim() !== expectedAnnotator) {
      throw new Error(
        `${file}/${row.case_id}: timing pseudonym does not match labels.`,
      );
    }
    const started = Date.parse(row.started_at_utc);
    const completed = Date.parse(row.completed_at_utc);
    if (
      !Number.isFinite(started) ||
      !Number.isFinite(completed) ||
      completed <= started
    ) {
      throw new Error(
        `${file}/${row.case_id}: timing needs ordered ISO timestamps.`,
      );
    }
    const active = positiveNumber(
      row.active_minutes,
      `${file}/${row.case_id}/active_minutes`,
    );
    const interruptions = nonnegativeNumber(
      row.interruption_minutes,
      `${file}/${row.case_id}/interruption_minutes`,
    );
    activeMinutes += active;
    interruptionMinutes += interruptions;
  }
  return { activeMinutes, interruptionMinutes };
}

function annotationAgreement(leftSet, rightSet) {
  const categories = ["positive", "negative", "indeterminate"];
  const leftCounts = Object.fromEntries(
    categories.map((category) => [category, 0]),
  );
  const rightCounts = Object.fromEntries(
    categories.map((category) => [category, 0]),
  );
  let groundTruthAgreements = 0;
  let categoricalAgreements = 0;
  for (const [unitId, right] of rightSet.recordsByUnit) {
    const left = leftSet.recordsByUnit.get(unitId);
    if (!left) throw new Error(`Pilot A is missing ${unitId}.`);
    leftCounts[left.ground_truth]++;
    rightCounts[right.ground_truth]++;
    if (left.ground_truth === right.ground_truth) groundTruthAgreements++;
    if (decisionsEqual(left, right)) categoricalAgreements++;
  }
  const total = rightSet.recordsByUnit.size;
  const observed = groundTruthAgreements / total;
  const expected = categories.reduce(
    (sum, category) =>
      sum + (leftCounts[category] / total) * (rightCounts[category] / total),
    0,
  );
  return {
    independently_reviewed_units: total,
    coverage: 1,
    ground_truth_exact_agreement: observed,
    categorical_dimension_exact_agreement: categoricalAgreements / total,
    cohens_kappa:
      expected === 1 ? null : (observed - expected) / (1 - expected),
  };
}

function timingReport(annotator, timing, projectedUnits) {
  return {
    pseudonym: annotator,
    active_minutes: timing.activeMinutes,
    interruption_minutes: timing.interruptionMinutes,
    units_per_active_hour:
      (60 * pilotManifest.annotation_unit_count) / timing.activeMinutes,
    projected_units: projectedUnits,
  };
}

function projectedHours(units, pilotUnits, activeMinutes) {
  return (units * activeMinutes) / pilotUnits / 60;
}

function positiveNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return parsed;
}

function nonnegativeNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return parsed;
}
