#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseCsv, renderCsv } from "./csv.mjs";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentci-candidate-smoke-"),
);
const a = path.join(temporary, "packet-a");
const b = path.join(temporary, "packet-b");
const labelsA = path.join(temporary, "pass-1.jsonl");
const labelsB = path.join(temporary, "pass-2.jsonl");
const report = path.join(temporary, "report.json");
try {
  run("candidate-pilot.mjs", "--check");
  run("candidate-pilot.mjs", "--export", a);
  run("candidate-pilot.mjs", "--export", b);
  const checksums = fs.readFileSync(path.join(a, "CHECKSUMS.sha256"), "utf8");
  if (checksums !== fs.readFileSync(path.join(b, "CHECKSUMS.sha256"), "utf8")) {
    throw new Error("Candidate exports differ before annotation.");
  }
  if (
    checksums.trim().split("\n").length !== 13 ||
    /(?:^|\n)[a-f0-9]{64}  (?:src|dist)\//.test(checksums)
  ) {
    throw new Error(
      "Candidate packet included unexpected source or bundle files.",
    );
  }
  const scannerCommit = JSON.parse(
    fs.readFileSync(
      path.join(root, "benchmark/candidate-pilot/manifest.json"),
      "utf8",
    ),
  ).candidate_scanner_commit;
  for (const packet of [a, b]) {
    const text = ["README.md", "CONTRACT.md", "manifest.json", "SOURCES.md"]
      .map((name) => fs.readFileSync(path.join(packet, name), "utf8"))
      .join("\n");
    for (const forbidden of [
      "ai-033",
      "control-013",
      "source_case_id",
      "original_stratum",
      "selection_reason",
      "analysis-agent-tool-fetch-unknown",
      scannerCommit,
    ]) {
      if (text.includes(forbidden))
        throw new Error(`Annotator static packet leaks ${forbidden}.`);
    }
  }
  failure("Refusing to overwrite", "candidate-pilot.mjs", "--export", a);

  for (const [packet, day, bom] of [
    [a, "01", true],
    [b, "09", false],
  ]) {
    const sheet = path.join(packet, "annotation-sheet.csv");
    const [header, ...rows] = parseCsv(fs.readFileSync(sheet, "utf8"));
    const column = Object.fromEntries(
      header.map((name, index) => [name, index]),
    );
    for (const row of rows) {
      row[column.ground_truth] = "negative";
      row[column.reachability] = "reachable";
      row[column.permissions_status] = "not-applicable";
      for (const field of [
        "untrusted_source_status",
        "agent_sink_status",
        "capability_status",
        "mitigation_status",
      ]) {
        row[column[field]] = "not-applicable";
      }
      row[column.explanation] =
        "Synthetic schema smoke only; not a human label.";
    }
    fs.writeFileSync(
      sheet,
      `${bom ? "\uFEFF" : ""}${renderCsv([header, ...rows])}`,
    );
    const timing = path.join(packet, "timing-sheet.csv");
    const [timingHeader, ...timingRows] = parseCsv(
      fs.readFileSync(timing, "utf8"),
    );
    const timingColumn = Object.fromEntries(
      timingHeader.map((name, index) => [name, index]),
    );
    for (const row of timingRows) {
      row[timingColumn.annotator_pseudonym] = "synthetic-smoke";
      row[timingColumn.started_at_utc] = `2026-01-${day}T00:00:00Z`;
      row[timingColumn.completed_at_utc] = `2026-01-${day}T00:30:00Z`;
      row[timingColumn.active_minutes] = "1";
      row[timingColumn.interruption_minutes] = "0";
    }
    fs.writeFileSync(timing, renderCsv([timingHeader, ...timingRows]));
  }
  importPass(a, labelsA, "1");
  importPass(b, labelsB, "2");
  failure(
    "EEXIST",
    "import-annotation-csv.mjs",
    path.join(a, "annotation-sheet.csv"),
    "synthetic-smoke",
    labelsA,
    "--coverage",
    "candidate-pilot",
    "--review-mode",
    "test-retest",
    "--pass",
    "1",
  );
  failure(
    "single-human test-retest",
    "compare-annotations.mjs",
    labelsA,
    labelsB,
    path.join(temporary, "independent.csv"),
    "--coverage",
    "candidate-pilot",
  );
  run("check-candidate-pilot-passes.mjs", a, b, labelsA, labelsB, report);
  const result = JSON.parse(fs.readFileSync(report, "utf8"));
  if (
    result.status !== "development-test-retest-only" ||
    result.annotation_units_per_pass !== 160 ||
    Object.keys(result.per_rule).length !== 10 ||
    result.accuracy_estimate !== null
  ) {
    throw new Error("Candidate report has wrong scope or counts.");
  }
  const comparison = run(
    "compare-annotations.mjs",
    labelsA,
    labelsB,
    path.join(temporary, "candidate-disagreements.csv"),
    "--coverage",
    "candidate-pilot",
    "--review-mode",
    "test-retest",
  );
  if (
    comparison.includes("%") ||
    !comparison.includes("No accuracy estimate")
  ) {
    throw new Error(
      "Candidate comparison printed a pooled agreement headline.",
    );
  }
  failure(
    "Report must be a new file",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    report,
  );

  const timingB = path.join(b, "timing-sheet.csv");
  const goodTiming = fs.readFileSync(timingB, "utf8");
  const [timingHeader, ...timingRows] = parseCsv(goodTiming);
  fs.writeFileSync(
    timingB,
    renderCsv([
      [...timingHeader, "active_minutes"],
      ...timingRows.map((row) => [...row, "1"]),
    ]),
  );
  failure(
    "Timing CSV header differs from the frozen template",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    path.join(temporary, "duplicate-timing-header.json"),
  );
  fs.writeFileSync(timingB, goodTiming);
  fs.writeFileSync(timingB, goodTiming.replaceAll("2026-01-09", "2026-01-07"));
  failure(
    "minimum is 7 days",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    path.join(temporary, "short-washout.json"),
  );
  fs.writeFileSync(timingB, goodTiming);
  fs.writeFileSync(timingB, goodTiming.replaceAll("2026-01-09", "2026-02-30"));
  failure(
    "ISO UTC timestamp ending in Z",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    path.join(temporary, "invalid-calendar-date.json"),
  );
  fs.writeFileSync(timingB, goodTiming);
  fs.writeFileSync(timingB, goodTiming.replaceAll(",1,0,", ",0,0,"));
  failure(
    "impossible recorded time",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    path.join(temporary, "zero-time.json"),
  );
  fs.writeFileSync(timingB, goodTiming);
  const contract = path.join(a, "CONTRACT.md");
  const goodContract = fs.readFileSync(contract);
  fs.appendFileSync(contract, "\nchanged\n");
  failure(
    "differs from its checksum",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    path.join(temporary, "tampered.json"),
  );
  fs.writeFileSync(contract, goodContract);
  fs.writeFileSync(path.join(a, "extra.txt"), "extra");
  failure(
    "missing or extra files",
    "check-candidate-pilot-passes.mjs",
    a,
    b,
    labelsA,
    labelsB,
    path.join(temporary, "extra.json"),
  );
  fs.unlinkSync(path.join(a, "extra.txt"));
  const badCsv = path.join(temporary, "bad-prefill.csv");
  fs.writeFileSync(
    badCsv,
    fs
      .readFileSync(path.join(b, "annotation-sheet.csv"), "utf8")
      .replace("case-001,dev,candidate-pilot", "case-001,eval,candidate-pilot"),
  );
  failure(
    "prefilled split changed",
    "import-annotation-csv.mjs",
    badCsv,
    "synthetic-smoke",
    path.join(temporary, "bad-prefill.jsonl"),
    "--coverage",
    "candidate-pilot",
    "--review-mode",
    "test-retest",
    "--pass",
    "2",
  );
  console.log(
    "Candidate pilot smoke passed: separate neutral packets, 160 units, safe import, paired washout and tamper gates. Synthetic labels were temporary only.",
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function importPass(packet, output, pass) {
  run(
    "import-annotation-csv.mjs",
    path.join(packet, "annotation-sheet.csv"),
    "synthetic-smoke",
    output,
    "--coverage",
    "candidate-pilot",
    "--review-mode",
    "test-retest",
    "--pass",
    pass,
  );
}

function run(script, ...args) {
  return execFileSync(
    process.execPath,
    [path.join(root, "scripts/benchmark", script), ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function failure(needle, script, ...args) {
  try {
    run(script, ...args);
  } catch (error) {
    if (`${error.stderr ?? ""}${error.message}`.includes(needle)) return;
    throw error;
  }
  throw new Error(`${script} unexpectedly succeeded; expected ${needle}.`);
}
