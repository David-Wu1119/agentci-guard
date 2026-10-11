#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  benchmarkRoot,
  loadContext,
  recordFromCsvRow,
  validateAnnotationSet,
  writeJsonLines,
} from "./annotation-lib.mjs";
import { csvObjects, parseCsv } from "./csv.mjs";

const [inputArgument, annotator, outputArgument, ...options] =
  process.argv.slice(2);
if (!inputArgument || !annotator || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/import-annotation-csv.mjs <filled.csv> <annotator-pseudonym> <output.jsonl> [--coverage all|review-plan|pilot|candidate-pilot] [--review-mode independent|test-retest] [--pass 1|2]",
  );
}
const { coverage, reviewMode, pass } = parseOptions(options);
const registryByCoverage = {
  all: "annotation-sheet.csv",
  "review-plan": "review-sheet.csv",
  pilot: "pilot/annotation-sheet.csv",
  "candidate-pilot": "candidate-pilot/annotation-sheet.csv",
};
const registryName = registryByCoverage[coverage];
if (!registryName) {
  throw new Error(
    "--coverage must be all, review-plan, pilot, or candidate-pilot.",
  );
}
const isPilot = ["pilot", "candidate-pilot"].includes(coverage);
if (isPilot && reviewMode !== "test-retest") {
  throw new Error(
    "A pilot requires --review-mode test-retest and --pass 1 or 2.",
  );
}
if (!isPilot && reviewMode === "test-retest") {
  throw new Error(
    "Test-retest imports are supported only for pilot or candidate-pilot.",
  );
}
if (reviewMode === "test-retest" && !["1", "2"].includes(pass)) {
  throw new Error("--review-mode test-retest requires --pass 1 or 2.");
}
if (reviewMode === "independent" && pass !== null) {
  throw new Error("--pass is valid only with --review-mode test-retest.");
}
const reviewStatus =
  reviewMode === "test-retest" ? `test-retest-pass-${pass}` : "independent";
const role =
  reviewMode === "test-retest" ? `test-retest pass ${pass}` : "independent";
const manifestName =
  coverage === "candidate-pilot"
    ? "candidate-pilot/manifest.json"
    : "manifest.json";
if (coverage === "candidate-pilot") {
  execFileSync(
    process.execPath,
    ["scripts/benchmark/candidate-pilot.mjs", "--check"],
    {
      cwd: path.resolve(benchmarkRoot, ".."),
      stdio: "pipe",
    },
  );
}
const context = loadContext(registryName, manifestName);
const csvText = fs.readFileSync(path.resolve(inputArgument), "utf8");
if (
  coverage === "candidate-pilot" &&
  JSON.stringify(parseCsv(csvText)[0]) !==
    JSON.stringify(Object.keys(context.registryRows[0]))
) {
  throw new Error("Candidate CSV header differs from the frozen registry.");
}
const rows = csvObjects(csvText);
const rowsByUnit = new Map();
for (const row of rows) {
  if (!row.unit_id) throw new Error("CSV contains a row without unit_id.");
  if (rowsByUnit.has(row.unit_id)) {
    throw new Error(`CSV contains duplicate unit ${row.unit_id}.`);
  }
  rowsByUnit.set(row.unit_id, row);
}
if (rowsByUnit.size !== context.registry.size) {
  throw new Error(
    `CSV has ${rowsByUnit.size} units; expected ${context.registry.size} from ${registryName}.`,
  );
}

const records = context.registryRows.map((registry) => {
  const row = rowsByUnit.get(registry.unit_id);
  if (!row) throw new Error(`CSV is missing ${registry.unit_id}.`);
  if (coverage === "candidate-pilot") {
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
      if (row[field] !== registry[field]) {
        throw new Error(`${registry.unit_id}: prefilled ${field} changed.`);
      }
    }
  }
  return recordFromCsvRow(row, annotator, reviewStatus);
});
validateAnnotationSet(records, {
  registryName,
  manifestName,
  role,
  expectedAnnotator: annotator,
});
writeJsonLines(path.resolve(outputArgument), records);
console.log(
  `Imported and validated ${records.length} ${coverage} annotation units for ${annotator} as ${reviewStatus}.`,
);

function parseOptions(values) {
  const parsed = {
    coverage: "all",
    reviewMode: "independent",
    pass: null,
  };
  const seen = new Set();
  for (let index = 0; index < values.length; index += 2) {
    const option = values[index];
    const value = values[index + 1];
    if (!option || !value || seen.has(option)) {
      throw new Error(
        "Options must be unique --coverage, --review-mode, or --pass value pairs.",
      );
    }
    seen.add(option);
    if (option === "--coverage") parsed.coverage = value;
    else if (option === "--review-mode") parsed.reviewMode = value;
    else if (option === "--pass") parsed.pass = value;
    else throw new Error(`Unknown option ${option}.`);
  }
  if (
    !["all", "review-plan", "pilot", "candidate-pilot"].includes(
      parsed.coverage,
    )
  ) {
    throw new Error(
      "--coverage must be all, review-plan, pilot, or candidate-pilot.",
    );
  }
  if (!["independent", "test-retest"].includes(parsed.reviewMode)) {
    throw new Error("--review-mode must be independent or test-retest.");
  }
  return parsed;
}
