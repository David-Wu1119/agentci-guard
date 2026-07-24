#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseCsv, renderCsv } from "./csv.mjs";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const benchmarkRoot = path.join(repositoryRoot, "benchmark");
const manifest = JSON.parse(
  fs.readFileSync(path.join(benchmarkRoot, "manifest.json"), "utf8"),
);
const sourcePath = path.join(benchmarkRoot, "annotation-sheet.csv");
const outputPath = path.join(benchmarkRoot, "review-sheet.csv");
const [header, ...rows] = parseCsv(fs.readFileSync(sourcePath, "utf8"));
const unitColumn = header.indexOf("unit_id");
const ruleColumn = header.indexOf("rule_id");
if (unitColumn < 0 || ruleColumn < 0) {
  throw new Error("annotation sheet is missing unit_id or rule_id.");
}

const plan = manifest.independent_review_plan;
const always = new Set(plan.always_review_tasks);
const selected = rows.filter((row) => {
  if (always.has(row[ruleColumn])) return true;
  const digest = crypto
    .createHash("sha256")
    .update(`${plan.seed}:${row[unitColumn]}`)
    .digest();
  const sample = digest.readUInt32BE(0) / 2 ** 32;
  return sample < plan.remaining_unit_sample_rate;
});
const rendered = renderCsv([header, ...selected]);
const mode = process.argv[2] ?? "--check";

if (mode === "--write") {
  fs.writeFileSync(outputPath, rendered);
  console.log(
    `Wrote deterministic review plan with ${selected.length}/${rows.length} units.`,
  );
} else if (mode === "--check") {
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";
  if (existing !== rendered) {
    console.error(
      "benchmark/review-sheet.csv is stale; run node scripts/benchmark/generate-review-sheet.mjs --write",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Verified deterministic review plan with ${selected.length}/${rows.length} units.`,
    );
  }
} else {
  throw new Error("Expected --check or --write.");
}
