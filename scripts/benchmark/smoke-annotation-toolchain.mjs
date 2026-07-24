#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { benchmarkRoot } from "./annotation-lib.mjs";
import { parseCsv, renderCsv } from "./csv.mjs";

const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentci-annotation-smoke-"),
);
try {
  const primaryCsv = path.join(temporary, "primary.csv");
  const reviewerCsv = path.join(temporary, "reviewer.csv");
  fillSynthetic(path.join(benchmarkRoot, "annotation-sheet.csv"), primaryCsv);
  fillSynthetic(path.join(benchmarkRoot, "review-sheet.csv"), reviewerCsv);
  introduceReviewerDisagreement(reviewerCsv);

  const primaryJsonl = path.join(temporary, "annotator-a.jsonl");
  const reviewerJsonl = path.join(temporary, "annotator-b.jsonl");
  const disagreements = path.join(temporary, "disagreements.csv");
  const finalJsonl = path.join(temporary, "adjudicated.jsonl");
  run([
    "scripts/benchmark/import-annotation-csv.mjs",
    primaryCsv,
    "smoke-a",
    primaryJsonl,
    "--coverage",
    "all",
  ]);
  run([
    "scripts/benchmark/import-annotation-csv.mjs",
    reviewerCsv,
    "smoke-b",
    reviewerJsonl,
    "--coverage",
    "review-plan",
  ]);
  run([
    "scripts/benchmark/compare-annotations.mjs",
    primaryJsonl,
    reviewerJsonl,
    disagreements,
  ]);
  fillAdjudications(disagreements, primaryCsv);
  run([
    "scripts/benchmark/adjudicate.mjs",
    primaryJsonl,
    reviewerJsonl,
    disagreements,
    finalJsonl,
    "smoke-adjudicator",
  ]);
  const finalRecords = fs
    .readFileSync(finalJsonl, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    !finalRecords.some(
      (record) =>
        record.review_status === "adjudicated" &&
        record.adjudicator === "smoke-adjudicator",
    )
  ) {
    throw new Error("Smoke adjudication did not preserve its human pseudonym.");
  }
  const resultDirectory = path.join(temporary, "results");
  run(["scripts/benchmark/score.mjs", finalJsonl], {
    AGENTCI_BENCHMARK_SPLIT: "dev",
    AGENTCI_BENCHMARK_OUTPUT_DIR: resultDirectory,
  });
  for (const required of [
    "metrics-dev.json",
    "metrics-dev.md",
    "errors-dev.csv",
  ]) {
    if (!fs.existsSync(path.join(resultDirectory, required))) {
      throw new Error(`Score smoke did not create ${required}.`);
    }
  }
  console.log(
    "Annotation and scoring toolchain smoke passed with synthetic temporary labels; no benchmark labels or metrics were created.",
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function fillSynthetic(source, destination) {
  const [header, ...rows] = parseCsv(fs.readFileSync(source, "utf8"));
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const row of rows) {
    row[column.ground_truth] = "negative";
    row[column.reachability] = "reachable";
    row[column.permissions_status] = "known";
    row[column.effective_permissions] = "Synthetic smoke value.";
    row[column.untrusted_source_status] = "absent";
    row[column.agent_sink_status] = "absent";
    row[column.capability_status] = "absent";
    row[column.mitigation_status] = "absent";
    row[column.explanation] =
      "Synthetic smoke label used only to test the annotation scripts.";
  }
  fs.writeFileSync(destination, renderCsv([header, ...rows]));
}

function introduceReviewerDisagreement(file) {
  const [header, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  if (rows.length === 0) throw new Error("Review plan is unexpectedly empty.");
  rows[0][column.ground_truth] = "indeterminate";
  rows[0][column.reachability] = "unknown";
  rows[0][column.explanation] =
    "Synthetic disagreement used only to test adjudication provenance.";
  fs.writeFileSync(file, renderCsv([header, ...rows]));
}

function fillAdjudications(disagreementFile, primaryFile) {
  const [decisionHeader, ...decisionRows] = parseCsv(
    fs.readFileSync(disagreementFile, "utf8"),
  );
  const [primaryHeader, ...primaryRows] = parseCsv(
    fs.readFileSync(primaryFile, "utf8"),
  );
  const primaryUnit = primaryHeader.indexOf("unit_id");
  const decisionUnit = decisionHeader.indexOf("unit_id");
  const primaryByUnit = new Map(
    primaryRows.map((row) => [row[primaryUnit], row]),
  );
  for (const row of decisionRows) {
    const source = primaryByUnit.get(row[decisionUnit]);
    if (!source) throw new Error(`Missing primary row ${row[decisionUnit]}.`);
    for (const [index, name] of decisionHeader.entries()) {
      const sourceIndex = primaryHeader.indexOf(name);
      if (sourceIndex >= 0) row[index] = source[sourceIndex];
    }
  }
  fs.writeFileSync(
    disagreementFile,
    renderCsv([decisionHeader, ...decisionRows]),
  );
}

function run(arguments_, environment = {}) {
  execFileSync(process.execPath, arguments_, {
    cwd: path.resolve(benchmarkRoot, ".."),
    stdio: "pipe",
    env: { ...process.env, ...environment },
  });
}
