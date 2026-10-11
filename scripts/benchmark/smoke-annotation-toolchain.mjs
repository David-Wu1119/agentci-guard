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
  const packetRootA = path.join(temporary, "pilot-packet-a");
  const packetRootB = path.join(temporary, "pilot-packet-b");
  for (const packetRoot of [packetRootA, packetRootB]) {
    run(["scripts/benchmark/export-pilot-packet.mjs", packetRoot]);
    verifyPilotPacket(packetRoot);
  }

  const pilotACsv = path.join(packetRootA, "annotation-sheet.csv");
  const pilotBCsv = path.join(packetRootB, "annotation-sheet.csv");
  fillSynthetic(pilotACsv, pilotACsv);
  fillSynthetic(pilotBCsv, pilotBCsv);
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
  const filledPilotCsv = fs.readFileSync(pilotACsv);
  expectFailure(
    [
      "scripts/benchmark/import-annotation-csv.mjs",
      pilotACsv,
      "pilot-solo",
      pilotACsv,
      "--coverage",
      "pilot",
      "--review-mode",
      "test-retest",
      "--pass",
      "1",
    ],
    "EEXIST",
  );
  if (!fs.readFileSync(pilotACsv).equals(filledPilotCsv)) {
    throw new Error("Annotation import overwrote the filled packet CSV.");
  }
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
  const importedPilotLabels = fs.readFileSync(pilotAJsonl);
  expectFailure(
    [
      "scripts/benchmark/compare-annotations.mjs",
      pilotAJsonl,
      pilotBJsonl,
      pilotAJsonl,
      "--coverage",
      "pilot",
      "--review-mode",
      "test-retest",
    ],
    "EEXIST",
  );
  if (!fs.readFileSync(pilotAJsonl).equals(importedPilotLabels)) {
    throw new Error("Annotation comparison overwrote imported labels.");
  }
  const pilotTimingA = path.join(packetRootA, "timing-sheet.csv");
  const pilotTimingB = path.join(packetRootB, "timing-sheet.csv");
  fillTiming(
    pilotTimingA,
    pilotTimingA,
    "pilot-solo",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:30:00Z",
  );
  fillTiming(
    pilotTimingB,
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
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-missing-packets-summary.json"),
    ],
    "Pilot summary requires both original packet directories.",
  );
  const validTimingB = fs.readFileSync(pilotTimingB, "utf8");
  fillTiming(
    pilotTimingB,
    pilotTimingB,
    "pilot-solo",
    "2026-01-08T00:00:00Z",
    "2026-01-08T00:30:00Z",
  );
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-invalid-washout-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
      "--review-mode",
      "test-retest",
    ],
    "the predeclared minimum is 7 days.",
  );
  fs.writeFileSync(pilotTimingB, validTimingB);
  const validTimingA = fs.readFileSync(pilotTimingA, "utf8");
  const [timingHeader, ...timingRows] = parseCsv(validTimingA);
  const startedColumn = timingHeader.indexOf("started_at_utc");
  const completedColumn = timingHeader.indexOf("completed_at_utc");
  for (const row of timingRows.slice(1)) {
    row[startedColumn] = timingRows[0][startedColumn];
    row[completedColumn] = timingRows[0][completedColumn];
  }
  fs.writeFileSync(pilotTimingA, renderCsv([timingHeader, ...timingRows]));
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-impossible-time-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "total active minutes exceed the pass elapsed time.",
  );
  fs.writeFileSync(pilotTimingA, validTimingA);
  for (const [column, value, expected] of [
    ["active_minutes", "31", "recorded minutes exceed the case elapsed time."],
    ["interruption_minutes", "", "must be a non-negative number."],
    [
      "started_at_utc",
      "2026-01-01T00:00:00",
      "timing needs ordered ISO timestamps.",
    ],
  ]) {
    const [header, ...rows] = parseCsv(validTimingA);
    rows[0][header.indexOf(column)] = value;
    fs.writeFileSync(pilotTimingA, renderCsv([header, ...rows]));
    expectFailure(
      [
        "scripts/benchmark/summarize-pilot.mjs",
        pilotTimingA,
        pilotTimingB,
        pilotAJsonl,
        pilotBJsonl,
        path.join(temporary, "pilot-invalid-row-timing-summary.json"),
        "--packet-a",
        packetRootA,
        "--packet-b",
        packetRootB,
      ],
      expected,
    );
    fs.writeFileSync(pilotTimingA, validTimingA);
  }
  run([
    "scripts/benchmark/summarize-pilot.mjs",
    pilotTimingA,
    pilotTimingB,
    pilotAJsonl,
    pilotBJsonl,
    pilotSummary,
    "--packet-a",
    packetRootA,
    "--packet-b",
    packetRootB,
    "--review-mode",
    "test-retest",
  ]);
  const pilotReport = JSON.parse(fs.readFileSync(pilotSummary, "utf8"));
  if (
    pilotReport.status !== "complete" ||
    pilotReport.review_mode !== "test-retest" ||
    !/^[a-f0-9]{64}$/.test(pilotReport.packet_checksum_sha256) ||
    pilotReport.annotation_units_per_pass !== 168 ||
    pilotReport.agreement.repeated_units !== 168
  ) {
    throw new Error("Pilot smoke produced an unexpected feasibility report.");
  }
  for (const [pass, packet, timing, labels] of [
    ["pass_1", packetRootA, pilotTimingA, pilotAJsonl],
    ["pass_2", packetRootB, pilotTimingB, pilotBJsonl],
  ]) {
    for (const [name, file] of [
      ["annotation_csv", path.join(packet, "annotation-sheet.csv")],
      ["timing_csv", timing],
      ["imported_jsonl", labels],
    ]) {
      if (
        pilotReport.input_sha256?.[pass]?.[name] !==
        sha256(fs.readFileSync(file))
      ) {
        throw new Error(`Pilot summary did not identify ${pass}/${name}.`);
      }
    }
  }
  const originalPilotCsv = fs.readFileSync(pilotACsv, "utf8");
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      pilotACsv,
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "Pilot summary output must be a new file outside the packets.",
  );
  if (fs.readFileSync(pilotACsv, "utf8") !== originalPilotCsv) {
    throw new Error("Pilot summary overwrote the human annotation CSV.");
  }
  const originalLabelsA = fs.readFileSync(pilotAJsonl, "utf8");
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      pilotAJsonl,
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "Pilot summary output must be a new file outside the packets.",
  );
  if (fs.readFileSync(pilotAJsonl, "utf8") !== originalLabelsA) {
    throw new Error("Pilot summary overwrote the imported labels.");
  }
  const linkedRules = path.join(temporary, "linked-rules.md");
  const originalRulesForLink = fs.readFileSync(
    path.join(packetRootA, "RULES.md"),
    "utf8",
  );
  fs.linkSync(path.join(packetRootA, "RULES.md"), linkedRules);
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      linkedRules,
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "Pilot summary output must be a new file outside the packets.",
  );
  if (
    fs.readFileSync(path.join(packetRootA, "RULES.md"), "utf8") !==
    originalRulesForLink
  ) {
    throw new Error("Pilot summary overwrote a hardlinked packet file.");
  }
  const [pilotHeader, ...pilotRows] = parseCsv(originalPilotCsv);
  pilotRows[0][pilotHeader.indexOf("repository")] = "synthetic/altered-repo";
  fs.writeFileSync(pilotACsv, renderCsv([pilotHeader, ...pilotRows]));
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-prefilled-drift-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "Pilot packet annotation-sheet.csv changed a prefilled cell.",
  );
  fs.writeFileSync(pilotACsv, originalPilotCsv);
  const externalTiming = path.join(temporary, "external-timing.csv");
  fs.copyFileSync(pilotTimingB, externalTiming);
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      externalTiming,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-external-timing-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "Timing input must be the checked packet timing-sheet.csv.",
  );
  const [firstLabel, ...remainingLabels] = originalLabelsA
    .trimEnd()
    .split("\n");
  const alteredLabel = JSON.parse(firstLabel);
  alteredLabel.explanation =
    "Altered after import, not present in the packet CSV.";
  fs.writeFileSync(
    pilotAJsonl,
    `${[JSON.stringify(alteredLabel), ...remainingLabels].join("\n")}\n`,
  );
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-mismatched-labels-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "label JSONL does not match the filled packet CSV.",
  );
  fs.writeFileSync(pilotAJsonl, originalLabelsA);
  const originalChecksums = fs.readFileSync(
    path.join(packetRootA, "CHECKSUMS.sha256"),
    "utf8",
  );
  for (const name of ["RULES.md", "SOURCES.md"]) {
    const original = fs.readFileSync(path.join(packetRootA, name), "utf8");
    const altered = `${original}\n# Matched synthetic packet tampering\n`;
    const originalRow = originalChecksums
      .split("\n")
      .find((line) => line.endsWith(`  ${name}`));
    const changedChecksums = originalChecksums.replace(
      originalRow,
      `${sha256(altered)}  ${name}`,
    );
    for (const packet of [packetRootA, packetRootB]) {
      fs.writeFileSync(path.join(packet, name), altered);
      fs.writeFileSync(path.join(packet, "CHECKSUMS.sha256"), changedChecksums);
    }
    expectFailure(
      [
        "scripts/benchmark/summarize-pilot.mjs",
        pilotTimingA,
        pilotTimingB,
        pilotAJsonl,
        pilotBJsonl,
        path.join(temporary, "pilot-matched-tamper-summary.json"),
        "--packet-a",
        packetRootA,
        "--packet-b",
        packetRootB,
      ],
      `Pilot packet ${name} differs from the source contract.`,
    );
    for (const packet of [packetRootA, packetRootB]) {
      fs.writeFileSync(path.join(packet, name), original);
      fs.writeFileSync(
        path.join(packet, "CHECKSUMS.sha256"),
        originalChecksums,
      );
    }
  }
  const rulesA = path.join(packetRootA, "RULES.md");
  const rulesB = path.join(packetRootB, "RULES.md");
  fs.appendFileSync(rulesB, "\n# Synthetic packet corruption\n");
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-corrupt-static-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "differs from its exported checksum.",
  );
  fs.copyFileSync(path.join(packetRootA, "RULES.md"), rulesB);
  const checksumsB = path.join(packetRootB, "CHECKSUMS.sha256");
  const checksumText = fs.readFileSync(checksumsB, "utf8");
  fs.writeFileSync(
    checksumsB,
    `${checksumText[0] === "0" ? "1" : "0"}${checksumText.slice(1)}`,
  );
  expectFailure(
    [
      "scripts/benchmark/summarize-pilot.mjs",
      pilotTimingA,
      pilotTimingB,
      pilotAJsonl,
      pilotBJsonl,
      path.join(temporary, "pilot-different-contract-summary.json"),
      "--packet-a",
      packetRootA,
      "--packet-b",
      packetRootB,
    ],
    "different exported packet checksums.",
  );

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
  for (const split of ["eval", "all"]) {
    expectFailure(
      ["scripts/benchmark/score.mjs", finalJsonl],
      `Refusing ${split} scoring: v3 evaluation workflows were used for detector tuning`,
      { AGENTCI_BENCHMARK_SPLIT: split },
    );
  }
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
  const developmentReport = JSON.parse(
    fs.readFileSync(path.join(resultDirectory, "metrics-dev.json"), "utf8"),
  );
  if (
    developmentReport.study_validity?.status !== "development-only" ||
    !developmentReport.study_validity.missing_scanner_rules.includes(
      "agentci/gated-ai-write-token",
    )
  ) {
    throw new Error("Development scores did not disclose the v3 rule gap.");
  }
  const [errorHeader, ...errorRows] = parseCsv(
    fs.readFileSync(path.join(resultDirectory, "errors-dev.csv"), "utf8"),
  );
  const errorColumn = Object.fromEntries(
    errorHeader.map((name, index) => [name, index]),
  );
  const errorsByUnit = new Map(
    errorRows.map((row) => [row[errorColumn.unit_id], row]),
  );
  for (const [unitId, kind, prediction, diagnostic] of [
    [
      "ai-027|job|check-duplicates|-|agentci%2Funtrusted-ai-write-token",
      "abstained-positive",
      "unknown",
      "agentci/analysis-agent-tool-fetch-unknown",
    ],
    [
      "ai-027|job|check-duplicates|-|agentci%2Fpull-request-target-ai",
      "false-negative",
      "negative",
      "",
    ],
    [
      "ai-027|step|check-duplicates|1|agentci%2Funtrusted-input-in-prompt",
      "false-negative",
      "negative",
      "",
    ],
  ]) {
    const row = errorsByUnit.get(unitId);
    if (
      !row ||
      row[errorColumn.error_kind] !== kind ||
      row[errorColumn.prediction] !== prediction ||
      row[errorColumn.diagnostic_codes] !== diagnostic
    ) {
      throw new Error(`Issue-tool diagnostic was misattributed at ${unitId}.`);
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
    if (
      row[column.case_id] === "ai-027" &&
      [
        "agentci/untrusted-ai-write-token",
        "agentci/pull-request-target-ai",
        "agentci/untrusted-input-in-prompt",
      ].includes(row[column.rule_id]) &&
      (row[column.scope] === "job" || row[column.step_index] === "1")
    ) {
      row[column.ground_truth] = "positive";
      row[column.evidence_lines] = "23";
    }
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
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  for (const [index, row] of rows.entries()) {
    row[column.annotator_pseudonym] = annotator;
    row[column.started_at_utc] = new Date(
      Date.parse(startedAt) + index * duration,
    ).toISOString();
    row[column.completed_at_utc] = new Date(
      Date.parse(completedAt) + index * duration,
    ).toISOString();
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

function expectFailure(arguments_, expectedMessage, environment = {}) {
  try {
    run(arguments_, environment);
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
