#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  decisionsEqual,
  readJsonLines,
  recordFromCsvRow,
  repositoryRoot,
  validateAnnotationSet,
} from "./annotation-lib.mjs";
import { csvObjects, parseCsv } from "./csv.mjs";
import { renderPilotSources } from "./pilot-sources.mjs";

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
    "Usage: node scripts/benchmark/summarize-pilot.mjs <timing-a.csv> <timing-b.csv> <labels-a.jsonl> <labels-b.jsonl> <summary.json> --packet-a <pass-1-directory> --packet-b <pass-2-directory> [--review-mode independent|test-retest]",
  );
}
const {
  reviewMode: requestedReviewMode,
  packetA,
  packetB,
} = parseOptions(options);

const pilotRoot = path.join(repositoryRoot, "benchmark/pilot");
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
const packetChecksumSha256 = verifyPilotPacketPair(packetA, packetB);
const outputPath = path.resolve(outputArgument);
const outputEntry = fs.lstatSync(outputPath, { throwIfNoEntry: false });
const resolvedOutput = path.join(
  fs.realpathSync(path.dirname(outputPath)),
  path.basename(outputPath),
);
const insidePacket = [packetA, packetB].some((packet) => {
  const relative = path.relative(fs.realpathSync(packet), resolvedOutput);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
});
if (outputEntry || insidePacket) {
  throw new Error(
    "Pilot summary output must be a new file outside the packets.",
  );
}
for (const [argument, packet] of [
  [timingAArgument, packetA],
  [timingBArgument, packetB],
]) {
  if (
    fs.realpathSync(path.resolve(argument)) !==
    fs.realpathSync(path.join(packet, "timing-sheet.csv"))
  ) {
    throw new Error(
      "Timing input must be the checked packet timing-sheet.csv.",
    );
  }
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
assertLabelsMatchPacket(packetA, labelsA, 1);
assertLabelsMatchPacket(packetB, labelsB, 2);

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
  packet_checksum_sha256: packetChecksumSha256,
  input_sha256: {
    pass_1: {
      annotation_csv: sha256(
        fs.readFileSync(path.join(packetA, "annotation-sheet.csv")),
      ),
      timing_csv: sha256(
        fs.readFileSync(path.join(packetA, "timing-sheet.csv")),
      ),
      imported_jsonl: sha256(fs.readFileSync(path.resolve(labelsAArgument))),
    },
    pass_2: {
      annotation_csv: sha256(
        fs.readFileSync(path.join(packetB, "annotation-sheet.csv")),
      ),
      timing_csv: sha256(
        fs.readFileSync(path.join(packetB, "timing-sheet.csv")),
      ),
      imported_jsonl: sha256(fs.readFileSync(path.resolve(labelsBArgument))),
    },
  },
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
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  flag: "wx",
});
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
    const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
    const started = Date.parse(row.started_at_utc);
    const completed = Date.parse(row.completed_at_utc);
    if (
      !utcTimestamp.test(row.started_at_utc) ||
      !utcTimestamp.test(row.completed_at_utc) ||
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
    if (active + interruptions > (completed - started) / 60_000 + 1e-9) {
      throw new Error(
        `${file}/${row.case_id}: recorded minutes exceed the case elapsed time.`,
      );
    }
    activeMinutes += active;
    interruptionMinutes += interruptions;
  }
  if (activeMinutes > (latestCompletedAt - earliestStartedAt) / 60_000 + 1e-9) {
    throw new Error(
      `${file}: total active minutes exceed the pass elapsed time.`,
    );
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

function assertLabelsMatchPacket(packetRoot, labelSet, pass) {
  const role =
    reviewMode === "test-retest" ? `test-retest pass ${pass}` : "independent";
  const status =
    reviewMode === "test-retest" ? `test-retest-pass-${pass}` : "independent";
  const records = csvObjects(
    fs.readFileSync(path.join(packetRoot, "annotation-sheet.csv"), "utf8"),
  ).map((row) => recordFromCsvRow(row, labelSet.annotator, status));
  const packetSet = validateAnnotationSet(records, {
    registryName: "pilot/annotation-sheet.csv",
    role,
    expectedAnnotator: labelSet.annotator,
  });
  for (const [unitId, record] of packetSet.recordsByUnit) {
    if (!isDeepStrictEqual(record, labelSet.recordsByUnit.get(unitId))) {
      throw new Error(
        `${unitId}: label JSONL does not match the filled packet CSV.`,
      );
    }
  }
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
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (
      !["--packet-a", "--packet-b", "--review-mode"].includes(key) ||
      !value ||
      value.startsWith("--") ||
      parsed.has(key)
    ) {
      throw new Error(
        "Expected --packet-a and --packet-b, with optional --review-mode.",
      );
    }
    parsed.set(key, value);
  }
  if (!parsed.has("--packet-a") || !parsed.has("--packet-b")) {
    throw new Error("Pilot summary requires both original packet directories.");
  }
  const reviewMode = parsed.get("--review-mode") ?? null;
  if (reviewMode && !["independent", "test-retest"].includes(reviewMode)) {
    throw new Error("--review-mode must be independent or test-retest.");
  }
  return {
    reviewMode,
    packetA: path.resolve(parsed.get("--packet-a")),
    packetB: path.resolve(parsed.get("--packet-b")),
  };
}

function verifyPilotPacketPair(left, right) {
  if (fs.realpathSync(left) === fs.realpathSync(right)) {
    throw new Error(
      "The two pilot passes must use distinct packet directories.",
    );
  }
  const expected = new Set([
    "ANNOTATION_GUIDE.md",
    "README.md",
    "RULES.md",
    "SOURCES.md",
    "analysis-model.md",
    "annotation-sheet.csv",
    "manifest.json",
    "timing-sheet.csv",
    ...pilotManifest.cases.map((item) =>
      path.posix.join("workflows", item.case_id, item.source_path),
    ),
  ]);
  for (const name of expected) {
    if (name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error(`Unsafe pilot packet path: ${name}.`);
    }
  }
  const checksumFile = "CHECKSUMS.sha256";
  const firstChecksums = fs.readFileSync(path.join(left, checksumFile), "utf8");
  if (
    firstChecksums !== fs.readFileSync(path.join(right, checksumFile), "utf8")
  ) {
    throw new Error("Pilot passes have different exported packet checksums.");
  }
  const checksums = new Map();
  for (const line of firstChecksums.trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    if (!match || checksums.has(match[2])) {
      throw new Error(
        `Invalid or duplicate pilot packet checksum row: ${line}.`,
      );
    }
    checksums.set(match[2], match[1]);
  }
  if (
    checksums.size !== expected.size ||
    [...expected].some((name) => !checksums.has(name))
  ) {
    throw new Error("Pilot packet checksums do not cover the exact allowlist.");
  }
  for (const [name, source] of [
    ["README.md", "benchmark/pilot/PACKET_README.md"],
    ["ANNOTATION_GUIDE.md", "ANNOTATION_GUIDE.md"],
    ["RULES.md", "benchmark/pilot/contracts/v0.1.1/RULES.md"],
    ["analysis-model.md", "benchmark/pilot/contracts/v0.1.1/analysis-model.md"],
    ["manifest.json", "benchmark/pilot/manifest.json"],
    ["annotation-sheet.csv", "benchmark/pilot/annotation-sheet.csv"],
    ["timing-sheet.csv", "benchmark/pilot/timing-sheet.csv"],
  ]) {
    if (
      checksums.get(name) !==
      sha256(fs.readFileSync(path.join(repositoryRoot, source)))
    ) {
      throw new Error(`Pilot packet ${name} differs from the source contract.`);
    }
  }
  if (
    checksums.get("SOURCES.md") !==
    sha256(renderPilotSources(pilotManifest.cases))
  ) {
    throw new Error(
      "Pilot packet SOURCES.md differs from the source contract.",
    );
  }
  for (const item of pilotManifest.cases) {
    const name = path.posix.join("workflows", item.case_id, item.source_path);
    if (
      checksums.get(name) !== item.source_sha256 ||
      sha256(fs.readFileSync(path.join(repositoryRoot, item.snapshot_path))) !==
        item.source_sha256
    ) {
      throw new Error(
        `${item.case_id}: packet workflow differs from the frozen source.`,
      );
    }
  }
  const fillable = new Set(["annotation-sheet.csv", "timing-sheet.csv"]);
  const expectedFiles = [...expected, checksumFile].sort();
  for (const root of [left, right]) {
    if (!fs.lstatSync(root).isDirectory()) {
      throw new Error(`${root} is not a regular packet directory.`);
    }
    const files = walkPacket(root)
      .map((file) => path.relative(root, file).split(path.sep).join("/"))
      .sort();
    if (
      files.length !== expectedFiles.length ||
      files.some((file, index) => file !== expectedFiles[index])
    ) {
      throw new Error(`${root} contains missing or unexpected packet files.`);
    }
    for (const [name, hash] of checksums) {
      if (fillable.has(name)) continue;
      if (sha256(fs.readFileSync(path.join(root, name))) !== hash) {
        throw new Error(`${root}/${name} differs from its exported checksum.`);
      }
    }
    assertPrefilledCells(root, "annotation-sheet.csv", "unit_id");
    assertPrefilledCells(root, "timing-sheet.csv", "case_id");
  }
  return sha256(firstChecksums);
}

function assertPrefilledCells(packetRoot, name, key) {
  const templateText = fs.readFileSync(path.join(pilotRoot, name), "utf8");
  const filledText = fs.readFileSync(path.join(packetRoot, name), "utf8");
  const [templateHeader] = parseCsv(templateText);
  const [filledHeader] = parseCsv(filledText);
  if (!isDeepStrictEqual(filledHeader, templateHeader)) {
    throw new Error(`Pilot packet ${name} changed its CSV header.`);
  }
  const templateRows = csvObjects(templateText);
  const filledRows = csvObjects(filledText);
  const byKey = new Map(filledRows.map((row) => [row[key], row]));
  if (
    byKey.size !== templateRows.length ||
    filledRows.length !== templateRows.length
  ) {
    throw new Error(`Pilot packet ${name} changed its case or unit coverage.`);
  }
  for (const original of templateRows) {
    const filled = byKey.get(original[key]);
    if (!filled) {
      throw new Error(
        `Pilot packet ${name} changed its case or unit coverage.`,
      );
    }
    for (const column of templateHeader) {
      if (original[column] !== "" && filled[column] !== original[column]) {
        throw new Error(`Pilot packet ${name} changed a prefilled cell.`);
      }
    }
  }
}

function walkPacket(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkPacket(candidate));
    else if (entry.isFile()) files.push(candidate);
    else
      throw new Error(`Pilot packet contains an unsafe entry: ${candidate}.`);
  }
  return files;
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
  if (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return parsed;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
