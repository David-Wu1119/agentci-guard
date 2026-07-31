#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { benchmarkRoot } from "./annotation-lib.mjs";
import { parseCsv, renderCsv } from "./csv.mjs";

const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentci-annotation-smoke-"),
);
try {
  const packetRoot = path.join(temporary, "pilot-packet");
  run(["scripts/benchmark/export-pilot-packet.mjs", packetRoot]);
  verifyPilotPacket(packetRoot);

  const pilotACsv = path.join(temporary, "pilot-a.csv");
  const pilotBCsv = path.join(temporary, "pilot-b.csv");
  fillSynthetic(
    path.join(benchmarkRoot, "pilot", "annotation-sheet.csv"),
    pilotACsv,
  );
  fillSynthetic(
    path.join(benchmarkRoot, "pilot", "annotation-sheet.csv"),
    pilotBCsv,
  );
  introduceReviewerDisagreement(pilotBCsv);
  const pilotAJsonl = path.join(temporary, "pilot-a.jsonl");
  const pilotBJsonl = path.join(temporary, "pilot-b.jsonl");
  run([
    "scripts/benchmark/import-annotation-csv.mjs",
    pilotACsv,
    "pilot-solo",
    pilotAJsonl,
    "--coverage",
    "pilot",
    "--review-mode",
    "test-retest",
    "--pass",
    "1",
  ]);
  run([
    "scripts/benchmark/import-annotation-csv.mjs",
    pilotBCsv,
    "pilot-solo",
    pilotBJsonl,
    "--coverage",
    "pilot",
    "--review-mode",
    "test-retest",
    "--pass",
    "2",
  ]);
  assertReviewStatus(pilotAJsonl, "test-retest-pass-1");
  assertReviewStatus(pilotBJsonl, "test-retest-pass-2");
  expectFailure(
    [
      "scripts/benchmark/compare-annotations.mjs",
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-invalid-independent-disagreements.csv"),
      "--coverage",
      "pilot",
    ],
    "independent record has invalid review_status.",
  );
  run([
    "scripts/benchmark/compare-annotations.mjs",
    pilotAJsonl,
    pilotBJsonl,
    path.join(temporary, "pilot-disagreements.csv"),
    "--coverage",
    "pilot",
    "--review-mode",
    "test-retest",
  ]);
  const pilotTimingA = path.join(temporary, "pilot-timing-a.csv");
  const pilotTimingB = path.join(temporary, "pilot-timing-b.csv");
  const pilotTimingTooSoon = path.join(temporary, "pilot-timing-too-soon.csv");
  fillTiming(
    path.join(benchmarkRoot, "pilot", "timing-sheet.csv"),
    pilotTimingA,
    "pilot-solo",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:30:00Z",
  );
  fillTiming(
    path.join(benchmarkRoot, "pilot", "timing-sheet.csv"),
    pilotTimingTooSoon,
    "pilot-solo",
    "2026-01-08T00:00:00Z",
    "2026-01-08T00:30:00Z",
  );
  fillTiming(
    path.join(benchmarkRoot, "pilot", "timing-sheet.csv"),
    pilotTimingB,
    "pilot-solo",
    "2026-01-09T00:00:00Z",
    "2026-01-09T00:30:00Z",
  );
  const pilotSummary = path.join(temporary, "pilot-summary.json");
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingTooSoon,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-invalid-washout-summary.json"),
      "--review-mode",
      "test-retest",
    ],
    "the predeclared minimum is 7 days.",
  );
  run([
    "scripts/benchmark/summarize-pilot.mjs",
    pilotTimingA,
    pilotTimingB,
    pilotAJsonl,
    pilotBJsonl,
    pilotSummary,
    "--review-mode",
    "test-retest",
  ]);
  const pilotReport = JSON.parse(fs.readFileSync(pilotSummary, "utf8"));
  if (
    pilotReport.status !== "complete" ||
    pilotReport.review_mode !== "test-retest" ||
    pilotReport.annotation_units_per_pass !== 168 ||
    pilotReport.agreement.repeated_units !== 168
  ) {
    throw new Error("Pilot smoke produced an unexpected feasibility report.");
  }

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

function assertReviewStatus(file, expected) {
  const records = fs
    .readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    records.length === 0 ||
    records.some((record) => record.review_status !== expected)
  ) {
    throw new Error(`${file} did not preserve ${expected} provenance.`);
  }
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

function fillTiming(source, destination, annotator, startedAt, completedAt) {
  const [header, ...rows] = parseCsv(fs.readFileSync(source, "utf8"));
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const row of rows) {
    row[column.annotator_pseudonym] = annotator;
    row[column.started_at_utc] = startedAt;
    row[column.completed_at_utc] = completedAt;
    row[column.active_minutes] = "20";
    row[column.interruption_minutes] = "0";
    row[column.notes] = "Synthetic smoke timing.";
  }
  fs.writeFileSync(destination, renderCsv([header, ...rows]));
}

function verifyPilotPacket(packetRoot) {
  const allowedTopLevel = new Set([
    "ANNOTATION_GUIDE.md",
    "CHECKSUMS.sha256",
    "README.md",
    "RULES.md",
    "SOURCES.md",
    "analysis-model.md",
    "annotation-sheet.csv",
    "manifest.json",
    "timing-sheet.csv",
    "workflows",
  ]);
  const unexpected = fs
    .readdirSync(packetRoot)
    .filter((entry) => !allowedTopLevel.has(entry));
  if (unexpected.length > 0) {
    throw new Error(
      `Pilot packet contains unexpected top-level entries: ${unexpected.join(", ")}.`,
    );
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packetRoot, "manifest.json"), "utf8"),
  );
  if (
    manifest.split !== "dev" ||
    manifest.review_mode !== "test-retest" ||
    manifest.pass_count !== 2 ||
    manifest.annotator_identity_policy !== "same-stable-pseudonym" ||
    manifest.minimum_washout_days !== 7 ||
    manifest.case_count !== 6 ||
    manifest.annotation_unit_count !== 168
  ) {
    throw new Error(
      "Pilot packet manifest is not the predeclared development-only test-retest protocol.",
    );
  }
  for (const item of manifest.cases) {
    const workflow = path.join(
      packetRoot,
      "workflows",
      item.case_id,
      item.source_path,
    );
    if (
      !fs.existsSync(workflow) ||
      sha256(fs.readFileSync(workflow)) !== item.source_sha256
    ) {
      throw new Error(`${item.case_id}: packet workflow hash is invalid.`);
    }
  }

  const checksums = new Map(
    fs
      .readFileSync(path.join(packetRoot, "CHECKSUMS.sha256"), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
        if (!match) throw new Error(`Invalid packet checksum row: ${line}`);
        return [match[2], match[1]];
      }),
  );
  const packetFiles = walk(packetRoot)
    .map((file) => path.relative(packetRoot, file).split(path.sep).join("/"))
    .filter((file) => file !== "CHECKSUMS.sha256")
    .sort();
  if (
    checksums.size !== packetFiles.length ||
    packetFiles.some(
      (file) =>
        !checksums.has(file) ||
        checksums.get(file) !==
          sha256(fs.readFileSync(path.join(packetRoot, file))),
    )
  ) {
    throw new Error("Pilot packet checksums do not cover the exact allowlist.");
  }
  if (
    packetFiles.some((file) =>
      /(^|\/)(?:src|dist|eval|results|predictions?)(?:\/|$)/i.test(file),
    )
  ) {
    throw new Error("Pilot packet leaked scanner or evaluation artifacts.");
  }
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

function expectFailure(arguments_, expectedMessage) {
  try {
    run(arguments_);
  } catch (error) {
    const message = `${error.message ?? ""}\n${error.stderr?.toString() ?? ""}`;
    if (message.includes(expectedMessage)) return;
    throw new Error(
      `Command failed for an unexpected reason; wanted ${JSON.stringify(expectedMessage)}.\n${message}`,
    );
  }
  throw new Error(
    `Command unexpectedly succeeded; wanted ${JSON.stringify(expectedMessage)}.`,
  );
}

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(candidate));
    else if (entry.isFile()) output.push(candidate);
  }
  return output;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
