#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { csvObjects } from "./csv.mjs";

const [leftArgument, rightArgument, decisionsArgument, outputArgument] =
  process.argv.slice(2);
if (!leftArgument || !rightArgument || !decisionsArgument || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/adjudicate.mjs <annotator-a.jsonl> <annotator-b.jsonl> <filled-disagreements.csv> <adjudicated.jsonl>",
  );
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
const left = byCase(readJsonLines(path.resolve(leftArgument)));
const right = byCase(readJsonLines(path.resolve(rightArgument)));
const decisions = new Map(
  csvObjects(fs.readFileSync(path.resolve(decisionsArgument), "utf8")).map(
    (row) => [`${row.case_id}:${row.rule_id}`, row],
  ),
);
const output = [];

for (const item of manifest.cases) {
  const leftEntry = left.get(item.case_id);
  const rightEntry = right.get(item.case_id);
  if (!leftEntry || !rightEntry) {
    throw new Error(`Missing independent labels for ${item.case_id}.`);
  }
  const labels = {};
  const rationales = {};
  const errorTypes = {};
  const sourceLabels = { a: {}, b: {} };
  for (const rule of manifest.rules) {
    const leftLabel = leftEntry.labels[rule];
    const rightLabel = rightEntry.labels[rule];
    sourceLabels.a[rule] = leftLabel;
    sourceLabels.b[rule] = rightLabel;
    if (leftLabel === rightLabel) {
      labels[rule] = leftLabel;
      continue;
    }
    const decision = decisions.get(`${item.case_id}:${rule}`);
    const adjudicated = decision?.adjudicated?.trim().toLowerCase();
    if (!["positive", "negative", "uncertain"].includes(adjudicated)) {
      throw new Error(`Missing adjudication for ${item.case_id}/${rule}.`);
    }
    if (!decision.rationale?.trim()) {
      throw new Error(
        `Missing adjudication rationale for ${item.case_id}/${rule}.`,
      );
    }
    labels[rule] = adjudicated;
    rationales[rule] = decision.rationale.trim();
    if (decision.error_type?.trim()) {
      errorTypes[rule] = decision.error_type.trim();
    }
  }
  output.push({
    case_id: item.case_id,
    annotator: "adjudicated",
    labels,
    rationales,
    error_types: errorTypes,
    source_labels: sourceLabels,
    notes: "",
  });
}
fs.writeFileSync(
  path.resolve(outputArgument),
  `${output.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
);
console.log(`Wrote ${output.length} adjudicated cases.`);

function readJsonLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function byCase(entries) {
  return new Map(entries.map((entry) => [entry.case_id, entry]));
}
