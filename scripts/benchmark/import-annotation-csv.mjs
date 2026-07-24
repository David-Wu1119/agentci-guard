#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  loadContext,
  recordFromCsvRow,
  validateAnnotationSet,
  writeJsonLines,
} from "./annotation-lib.mjs";
import { csvObjects } from "./csv.mjs";

const [inputArgument, annotator, outputArgument, ...options] =
  process.argv.slice(2);
if (!inputArgument || !annotator || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/import-annotation-csv.mjs <filled.csv> <annotator-pseudonym> <output.jsonl> [--coverage all|review-plan]",
  );
}
const coverageIndex = options.indexOf("--coverage");
const coverage = coverageIndex >= 0 ? options[coverageIndex + 1] : "all";
if (!["all", "review-plan"].includes(coverage)) {
  throw new Error("--coverage must be all or review-plan.");
}
const registryName =
  coverage === "all" ? "annotation-sheet.csv" : "review-sheet.csv";
const context = loadContext(registryName);
const rows = csvObjects(fs.readFileSync(path.resolve(inputArgument), "utf8"));
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
  return recordFromCsvRow(row, annotator);
});
validateAnnotationSet(records, {
  registryName,
  role: "independent",
  expectedAnnotator: annotator,
});
writeJsonLines(path.resolve(outputArgument), records);
console.log(
  `Imported and validated ${records.length} ${coverage} annotation units for ${annotator}.`,
);
