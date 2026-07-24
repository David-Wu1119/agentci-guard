#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { renderCsv } from "./csv.mjs";

const [leftArgument, rightArgument, outputArgument] = process.argv.slice(2);
if (!leftArgument || !rightArgument || !outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/compare-annotations.mjs <annotator-a.jsonl> <annotator-b.jsonl> <disagreements.csv>",
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
const rows = [
  [
    "case_id",
    "rule_id",
    "annotator_a",
    "annotator_b",
    "adjudicated",
    "error_type",
    "rationale",
  ],
];
let agreements = 0;
let decisions = 0;

for (const item of manifest.cases) {
  const leftEntry = left.get(item.case_id);
  const rightEntry = right.get(item.case_id);
  if (!leftEntry || !rightEntry) {
    throw new Error(`Missing independent labels for ${item.case_id}.`);
  }
  for (const rule of manifest.rules) {
    const leftLabel = leftEntry.labels?.[rule];
    const rightLabel = rightEntry.labels?.[rule];
    decisions++;
    if (leftLabel === rightLabel) agreements++;
    else {
      rows.push([item.case_id, rule, leftLabel, rightLabel, "", "", ""]);
    }
  }
}
fs.writeFileSync(path.resolve(outputArgument), renderCsv(rows));
console.log(
  `Agreement ${agreements}/${decisions} (${((100 * agreements) / decisions).toFixed(1)}%); ${rows.length - 1} disagreement(s).`,
);

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
