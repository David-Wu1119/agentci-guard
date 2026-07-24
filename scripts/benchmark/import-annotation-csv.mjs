#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { csvObjects } from "./csv.mjs";

const [inputArgument, annotator, outputArgument] = process.argv.slice(2);
if (!inputArgument || !annotator || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/import-annotation-csv.mjs <filled.csv> <annotator-pseudonym> <output.jsonl>",
  );
}
if (annotator === "adjudicated") {
  throw new Error("Independent annotator pseudonym cannot be adjudicated.");
}
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
const rows = csvObjects(fs.readFileSync(path.resolve(inputArgument), "utf8"));
const byCase = new Map(rows.map((row) => [row.case_id, row]));
const output = [];

for (const item of manifest.cases) {
  const row = byCase.get(item.case_id);
  if (!row) throw new Error(`CSV is missing ${item.case_id}.`);
  const labels = {};
  let rationaleRequired = false;
  for (const rule of manifest.rules) {
    const value = row[rule]?.trim().toLowerCase();
    if (!["positive", "negative", "uncertain"].includes(value)) {
      throw new Error(
        `${item.case_id}/${rule} must be positive, negative, or uncertain.`,
      );
    }
    labels[rule] = value;
    if (value !== "negative") rationaleRequired = true;
  }
  if (rationaleRequired && !row.notes?.trim()) {
    throw new Error(
      `${item.case_id} needs a note because it contains a positive or uncertain label.`,
    );
  }
  output.push({
    case_id: item.case_id,
    annotator,
    labels,
    rationales: {},
    error_types: {},
    notes: row.notes?.trim() ?? "",
  });
}
if (byCase.size !== manifest.cases.length) {
  throw new Error("CSV contains unknown or duplicate benchmark cases.");
}
fs.writeFileSync(
  path.resolve(outputArgument),
  `${output.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
);
console.log(`Imported ${output.length} cases for ${annotator}.`);
