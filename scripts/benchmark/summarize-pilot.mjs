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
  ...options
] = process.argv.slice(2);
if (
  !timingAArgument ||
  !timingBArgument ||
  !labelsAArgument ||
  !labelsBArgument ||
  !outputArgument
) {
  throw new Error(
    "Usage: node scripts/benchmark/summarize-pilot.mjs <timing-a.csv> <timing-b.csv> <labels-a.jsonl> <labels-b.jsonl> <summary.json> [--review-mode independent|test-retest]",
  );
}
const requestedReviewMode = parseOptions(options);

const pilotRoot = path.resolve("benchmark/pilot");
const pilotManifest = JSON.parse(
  fs.readFileSync(path.join(pilotRoot, "manifest.json"), "utf8"),
);
const reviewMode = requestedReviewMode ?? pilotManifest.review_mode;
const expectedIdentityPolicy =
  reviewMode === "test-retest"
    ? "same-stable-pseudonym"
    : "different-stable-pseudonyms";
if (
  reviewMode !== pilotManifest.review_mode ||
  pilotManifest.pass_count !== 2 ||
  pilotManifest.annotator_identity_policy !== expectedIdentityPolicy ||
  (reviewMode === "test-retest" && pilotManifest.minimum_washout_days !== 7)
) {
  throw new Error(
    "Requested review mode does not match the frozen pilot protocol.",
  );
}
const labelsA = validateAnnotationSet(
  readJsonLines(path.resolve(labelsAArgument)),
  {
    registryName: "pilot/annotation-sheet.csv",
    role: reviewMode === "test-retest" ? "test-retest pass 1" : "independent",
  },
);
const labelsB = validateAnnotationSet(
  readJsonLines(path.resolve(labelsBArgument)),
  {
    registryName: "pilot/annotation-sheet.csv",
    role: reviewMode === "test-retest" ? "test-retest pass 2" : "independent",
  },
);
if (reviewMode === "independent" && labelsA.annotator === labelsB.annotator) {
  throw new Error("Pilot label files must use different human pseudonyms.");
}
if (reviewMode === "test-retest" && labelsA.annotator !== labelsB.annotator) {
  throw new Error(
    "Test-retest pilot label files must use the same stable human pseudonym.",
  );
}

const timingA = validateTiming(
  path.resolve(timingAArgument),
  labelsA.annotator,
);
const timingB = validateTiming(
  path.resolve(timingBArgument),
  labelsB.annotator,
);
const washout =
  reviewMode === "test-retest" ? validateWashout(timingA, timingB) : null;
const agreement = annotationAgreement(labelsA, labelsB, reviewMode);
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
const secondPassHours = projectedHours(
  reviewRegistry.length,
  pilotManifest.annotation_unit_count,
  timingB.activeMinutes,
);
const report = {
  schema_version: 2,
  pilot_id: pilotManifest.pilot_id,
  status: "complete",
  review_mode: reviewMode,
  purpose:
    reviewMode === "test-retest"
      ? "Annotation feasibility and intra-annotator repeatability only; these development labels are not benchmark accuracy or inter-rater agreement evidence."
      : "Annotation feasibility and inter-rater agreement only; these development labels are not benchmark accuracy evidence.",
  cases: pilotManifest.case_count,
  annotation_units_per_pass: pilotManifest.annotation_unit_count,
  passes: [
    timingReport(1, "primary", labelsA.annotator, timingA, fullRegistry.length),
    timingReport(
      2,
      reviewMode === "test-retest" ? "repeat" : "independent-review",
      labelsB.annotator,
      timingB,
      reviewRegistry.length,
    ),
  ],
  agreement,
  washout,
  projected_formal_annotation_hours: {
    primary: primaryHours,
    second_pass: secondPassHours,
    second_pass_role:
      reviewMode === "test-retest" ? "repeat review" : "independent review",
    combined_before_resolution: primaryHours + secondPassHours,
    caution:
      "Projection is linear and excludes disagreement resolution, breaks, coordination, and workflow-size distribution differences.",
  },
};
fs.writeFileSync(
  path.resolve(outputArgument),
  `${JSON.stringify(report, null, 2)}\n`,
);
const agreementLabel =
  reviewMode === "test-retest" ? "test-retest agreement" : "agreement";
console.log(
  `Wrote pilot summary: ${pilotManifest.annotation_unit_count} units per pass, ${(100 * agreement.ground_truth_exact_agreement).toFixed(1)}% ground-truth ${agreementLabel}, ${report.projected_formal_annotation_hours.combined_before_resolution.toFixed(1)} projected combined active hours before disagreement resolution.`,
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
  let earliestStartedAt = Number.POSITIVE_INFINITY;
  let latestCompletedAt = Number.NEGATIVE_INFINITY;
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
    earliestStartedAt = Math.min(earliestStartedAt, started);
    latestCompletedAt = Math.max(latestCompletedAt, completed);
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
  return {
    activeMinutes,
    interruptionMinutes,
    earliestStartedAt,
    latestCompletedAt,
  };
}

function annotationAgreement(leftSet, rightSet, mode) {
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
  const common = {
    coverage: 1,
    ground_truth_exact_agreement: observed,
    categorical_dimension_exact_agreement: categoricalAgreements / total,
  };
  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);
  return mode === "test-retest"
    ? {
        repeated_units: total,
        ...common,
        test_retest_kappa: kappa,
      }
    : {
        independently_reviewed_units: total,
        ...common,
        cohens_kappa: kappa,
      };
}

function timingReport(pass, role, annotator, timing, projectedUnits) {
  return {
    pass,
    role,
    pseudonym: annotator,
    active_minutes: timing.activeMinutes,
    interruption_minutes: timing.interruptionMinutes,
    units_per_active_hour:
      (60 * pilotManifest.annotation_unit_count) / timing.activeMinutes,
    projected_units: projectedUnits,
  };
}

function validateWashout(firstPass, secondPass) {
  const minimumDays = pilotManifest.minimum_washout_days ?? 7;
  const actualDays =
    (secondPass.earliestStartedAt - firstPass.latestCompletedAt) /
    (24 * 60 * 60 * 1000);
  if (actualDays < minimumDays) {
    throw new Error(
      `Test-retest pass 2 started ${actualDays.toFixed(2)} days after pass 1 ended; the predeclared minimum is ${minimumDays} days.`,
    );
  }
  return {
    minimum_days: minimumDays,
    actual_days: Number(actualDays.toFixed(3)),
    pass_1_completed_at_utc: new Date(
      firstPass.latestCompletedAt,
    ).toISOString(),
    pass_2_started_at_utc: new Date(secondPass.earliestStartedAt).toISOString(),
  };
}

function parseOptions(values) {
  if (values.length === 0) return null;
  if (values.length !== 2 || values[0] !== "--review-mode" || !values[1]) {
    throw new Error(
      "Expected either no options or --review-mode <independent|test-retest>.",
    );
  }
  if (!["independent", "test-retest"].includes(values[1])) {
    throw new Error("--review-mode must be independent or test-retest.");
  }
  return values[1];
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
