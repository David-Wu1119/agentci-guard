#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  decisionsEqual,
  loadContext,
  readJsonLines,
  recordFromCsvRow,
  repositoryRoot,
  validateAnnotationSet,
} from "./annotation-lib.mjs";
import { csvObjects, parseCsv } from "./csv.mjs";

const [packetAArg, packetBArg, labelsAArg, labelsBArg, outputArg, ...extra] =
  process.argv.slice(2);
if (
  !packetAArg ||
  !packetBArg ||
  !labelsAArg ||
  !labelsBArg ||
  !outputArg ||
  extra.length
) {
  throw new Error(
    "Usage: check-candidate-pilot-passes.mjs <pass-1-packet> <pass-2-packet> <pass-1.jsonl> <pass-2.jsonl> <new-report.json>",
  );
}
execFileSync(
  process.execPath,
  ["scripts/benchmark/candidate-pilot.mjs", "--check"],
  {
    cwd: repositoryRoot,
    stdio: "pipe",
  },
);
const packets = [packetAArg, packetBArg].map((value) =>
  fs.realpathSync(path.resolve(value)),
);
if (packets[0] === packets[1])
  throw new Error("Passes require two separate packets.");
const labelPaths = [labelsAArg, labelsBArg].map((value) =>
  fs.realpathSync(path.resolve(value)),
);
const output = path.resolve(outputArg);
const resolvedOutput = path.join(
  fs.realpathSync(path.dirname(output)),
  path.basename(output),
);
if (
  fs.existsSync(output) ||
  packets.some((packet) => inside(packet, resolvedOutput))
) {
  throw new Error("Report must be a new file outside both packets.");
}
const expectedRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentci-candidate-expected-"),
);
const expectedPacket = path.join(expectedRoot, "packet");
let expectedChecksums;
try {
  execFileSync(
    process.execPath,
    ["scripts/benchmark/candidate-pilot.mjs", "--export", expectedPacket],
    {
      cwd: repositoryRoot,
      stdio: "pipe",
    },
  );
  expectedChecksums = fs.readFileSync(
    path.join(expectedPacket, "CHECKSUMS.sha256"),
    "utf8",
  );
} finally {
  fs.rmSync(expectedRoot, { recursive: true, force: true });
}
for (const packet of packets) verifyPacket(packet, expectedChecksums);

const context = loadContext(
  "candidate-pilot/annotation-sheet.csv",
  "candidate-pilot/manifest.json",
);
const labels = labelPaths.map((file, index) =>
  validateAnnotationSet(readJsonLines(file), {
    registryName: "candidate-pilot/annotation-sheet.csv",
    manifestName: "candidate-pilot/manifest.json",
    role: `test-retest pass ${index + 1}`,
  }),
);
if (labels[0].annotator !== labels[1].annotator) {
  throw new Error("Both passes must use the same stable human pseudonym.");
}
for (const [index, packet] of packets.entries()) {
  const csvText = fs.readFileSync(
    path.join(packet, "annotation-sheet.csv"),
    "utf8",
  );
  if (
    JSON.stringify(parseCsv(csvText)[0]) !==
    JSON.stringify(Object.keys(context.registryRows[0]))
  ) {
    throw new Error(
      `Pass ${index + 1} CSV header differs from the frozen registry.`,
    );
  }
  const rows = csvObjects(csvText);
  if (rows.length !== context.registry.size)
    throw new Error(`Pass ${index + 1} has incomplete annotation CSV.`);
  const seenUnits = new Set();
  for (const row of rows) {
    if (seenUnits.has(row.unit_id))
      throw new Error(
        `Pass ${index + 1} CSV contains duplicate unit ${row.unit_id}.`,
      );
    seenUnits.add(row.unit_id);
    const registry = context.registry.get(row.unit_id);
    if (!registry) throw new Error(`Unknown candidate unit ${row.unit_id}.`);
    for (const field of [
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
    ]) {
      if (row[field] !== registry[field])
        throw new Error(`${row.unit_id}: prefilled ${field} changed.`);
    }
    const record = recordFromCsvRow(
      row,
      labels[index].annotator,
      `test-retest-pass-${index + 1}`,
    );
    if (
      !isDeepStrictEqual(record, labels[index].recordsByUnit.get(row.unit_id))
    ) {
      throw new Error(
        `${row.unit_id}: imported label does not match the filled packet CSV.`,
      );
    }
  }
}
const timings = packets.map((packet) =>
  validateTiming(
    path.join(packet, "timing-sheet.csv"),
    labels[0].annotator,
    context.manifest.cases,
  ),
);
const washoutDays =
  (timings[1].firstStarted - timings[0].lastCompleted) / 86_400_000;
if (washoutDays < context.manifest.minimum_washout_days) {
  throw new Error(
    `Pass 2 began ${washoutDays.toFixed(2)} days after pass 1 ended; minimum is 7 days.`,
  );
}
const perRule = {};
for (const [unitId, first] of labels[0].recordsByUnit) {
  const second = labels[1].recordsByUnit.get(unitId);
  const rule = first.rule_id;
  perRule[rule] ??= {
    pass_1: { positive: 0, negative: 0, indeterminate: 0 },
    pass_2: { positive: 0, negative: 0, indeterminate: 0 },
    ground_truth_disagreements: 0,
    full_decision_disagreements: 0,
  };
  perRule[rule].pass_1[first.ground_truth]++;
  perRule[rule].pass_2[second.ground_truth]++;
  if (first.ground_truth !== second.ground_truth)
    perRule[rule].ground_truth_disagreements++;
  if (!decisionsEqual(first, second))
    perRule[rule].full_decision_disagreements++;
}
const report = {
  schema_version: 1,
  pilot_id: context.manifest.pilot_id,
  source_manifest_sha256: context.manifest.source_manifest_sha256,
  contract_sha256: context.manifest.contract_sha256,
  candidate_scanner_commit: context.manifest.candidate_scanner_commit,
  candidate_scanner_source_tree: context.manifest.candidate_scanner_source_tree,
  candidate_bundle_sha256: context.manifest.candidate_bundle_sha256,
  status: "development-test-retest-only",
  accuracy_estimate: null,
  packet_checksums_sha256: sha256(expectedChecksums),
  self_reported_same_human_pseudonym: labels[0].annotator,
  washout_days: Number(washoutDays.toFixed(3)),
  annotation_units_per_pass: context.registry.size,
  passes: timings.map((timing, index) => ({
    pass: index + 1,
    active_minutes_self_reported: timing.activeMinutes,
    interruption_minutes_self_reported: timing.interruptionMinutes,
    annotation_csv_sha256: sha256(
      fs.readFileSync(path.join(packets[index], "annotation-sheet.csv")),
    ),
    timing_csv_sha256: sha256(
      fs.readFileSync(path.join(packets[index], "timing-sheet.csv")),
    ),
    imported_jsonl_sha256: sha256(fs.readFileSync(labelPaths[index])),
  })),
  per_rule: perRule,
};
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
  flag: "wx",
});
console.log(
  `Checked ${context.registry.size} candidate units per pass, same human, ${washoutDays.toFixed(2)}-day washout; no accuracy estimate.`,
);

function verifyPacket(packet, expectedChecksums) {
  const actual = fs.readFileSync(path.join(packet, "CHECKSUMS.sha256"), "utf8");
  if (actual !== expectedChecksums)
    throw new Error(
      "Pass packets differ from the pinned blank export or each other.",
    );
  const listed = actual
    .trim()
    .split("\n")
    .map((line) => line.slice(66));
  const actualFiles = walk(packet)
    .map((file) => path.relative(packet, file).split(path.sep).join("/"))
    .sort();
  const expectedFiles = [...listed, "CHECKSUMS.sha256"].sort();
  if (!isDeepStrictEqual(actualFiles, expectedFiles)) {
    throw new Error(
      "Packet contains missing or extra files outside the frozen export.",
    );
  }
  for (const line of actual.trim().split("\n")) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error("Malformed packet checksum list.");
    if (["annotation-sheet.csv", "timing-sheet.csv"].includes(match[2]))
      continue;
    const relative = path.normalize(match[2]);
    if (
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`)
    ) {
      throw new Error("Unsafe packet checksum path.");
    }
    if (sha256(fs.readFileSync(path.join(packet, relative))) !== match[1]) {
      throw new Error(
        `Packet static file ${relative} differs from its checksum.`,
      );
    }
  }
}

function validateTiming(file, annotator, cases) {
  const text = fs.readFileSync(file, "utf8");
  const frozenHeader = parseCsv(
    fs.readFileSync(
      path.join(repositoryRoot, "benchmark/candidate-pilot/timing-sheet.csv"),
      "utf8",
    ),
  )[0];
  if (!isDeepStrictEqual(parseCsv(text)[0], frozenHeader)) {
    throw new Error(
      `${file}: Timing CSV header differs from the frozen template.`,
    );
  }
  const rows = csvObjects(text);
  if (rows.length !== cases.length)
    throw new Error(`${file}: expected ${cases.length} timing rows.`);
  const byCase = new Map(rows.map((row) => [row.case_id, row]));
  if (
    byCase.size !== cases.length ||
    cases.some((item) => !byCase.has(item.case_id))
  ) {
    throw new Error(`${file}: missing or duplicate timing case.`);
  }
  let firstStarted = Infinity;
  let lastCompleted = -Infinity;
  let activeMinutes = 0;
  let interruptionMinutes = 0;
  for (const row of rows) {
    if (row.annotator_pseudonym !== annotator)
      throw new Error(`${file}/${row.case_id}: pseudonym differs from labels.`);
    const started = utc(
      row.started_at_utc,
      `${file}/${row.case_id}/started_at_utc`,
    );
    const completed = utc(
      row.completed_at_utc,
      `${file}/${row.case_id}/completed_at_utc`,
    );
    const active = minutes(
      row.active_minutes,
      `${file}/${row.case_id}/active_minutes`,
    );
    const interruptions = minutes(
      row.interruption_minutes,
      `${file}/${row.case_id}/interruption_minutes`,
    );
    if (
      completed <= started ||
      active <= 0 ||
      active + interruptions > (completed - started) / 60_000 + 1e-9
    ) {
      throw new Error(`${file}/${row.case_id}: impossible recorded time.`);
    }
    firstStarted = Math.min(firstStarted, started);
    lastCompleted = Math.max(lastCompleted, completed);
    activeMinutes += active;
    interruptionMinutes += interruptions;
  }
  if (activeMinutes > (lastCompleted - firstStarted) / 60_000 + 1e-9) {
    throw new Error(
      `${file}: total active minutes exceed the pass elapsed time.`,
    );
  }
  return { firstStarted, lastCompleted, activeMinutes, interruptionMinutes };
}

function utc(value, field) {
  const parsed = Date.parse(value);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)
  ) {
    throw new Error(`${field} must be an ISO UTC timestamp ending in Z.`);
  }
  return parsed;
}

function minutes(value, field) {
  if (!/^(?:\d+)(?:\.\d+)?$/.test(value))
    throw new Error(`${field} must be a non-negative number.`);
  return Number(value);
}

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(candidate);
    if (entry.isFile()) return [candidate];
    throw new Error(`Packet contains unsupported entry ${candidate}.`);
  });
}
