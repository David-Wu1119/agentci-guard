#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, renderCsv } from "./csv.mjs";
import { renderPilotSources } from "./pilot-sources.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const benchmark = path.join(root, "benchmark");
const pilot = path.join(benchmark, "candidate-pilot");
const files = {
  manifest: path.join(pilot, "manifest.json"),
  sheet: path.join(pilot, "annotation-sheet.csv"),
  timing: path.join(pilot, "timing-sheet.csv"),
};
const selection = [
  ["ai-015", "case-001", "actor and parent-content provenance"],
  ["ai-033", "case-002", "explicit agent tool-fetch uncertainty"],
  ["control-013", "case-003", "non-agent negative control"],
  ["codex-004", "case-004", "coding-agent Action diversity"],
  ["aider-002", "case-005", "coding-agent CLI diversity"],
  ["cursor-004", "case-006", "coding-agent CLI diversity"],
  ["openhands-001", "case-007", "agent configuration diversity"],
];
const tasks = {
  "agentci/agent-usage": "step",
  "agentci/untrusted-ai-write-token": "job",
  "agentci/gated-ai-write-token": "job",
  "agentci/pull-request-target-ai": "job",
  "agentci/ai-with-secrets": "job",
  "agentci/untrusted-input-in-prompt": "step",
  "agentci/ai-shell-access": "step",
  "agentci/broad-write-permissions": "job",
  "agentci/unpinned-ai-action": "step",
  "agentci/unsafe-checkout": "step",
};
const [mode = "--check", argument, ...extra] = process.argv.slice(2);
if (
  !["--check", "--write", "--export"].includes(mode) ||
  extra.length ||
  (mode === "--export") !== Boolean(argument)
) {
  throw new Error(
    "Usage: candidate-pilot.mjs --check|--write|--export <new-output-directory>",
  );
}

const sourceRaw = fs.readFileSync(path.join(benchmark, "manifest.json"));
const source = JSON.parse(sourceRaw);
if (source.benchmark_id !== "agentci-real-workflows-v3") {
  throw new Error("Candidate pilot requires the frozen v3 source manifest.");
}
const existingManifest = fs.existsSync(files.manifest)
  ? JSON.parse(fs.readFileSync(files.manifest, "utf8"))
  : null;
const scannerCommit =
  existingManifest?.candidate_scanner_commit ?? git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(scannerCommit))
  throw new Error("Invalid scanner commit pin.");
const scannerTree = git("rev-parse", `${scannerCommit}:src`);
if (
  mode === "--write" &&
  git("status", "--porcelain", "--", "src", "dist/index.js")
) {
  throw new Error(
    "Commit scanner source and bundle before freezing a candidate pilot.",
  );
}
const bundleHash = sha256(
  execFileSync("git", ["show", `${scannerCommit}:dist/index.js`], {
    cwd: root,
  }),
);
if (
  existingManifest &&
  (existingManifest.candidate_bundle_sha256 !== bundleHash ||
    existingManifest.candidate_scanner_source_tree !== scannerTree)
) {
  throw new Error(
    "Pinned candidate scanner objects differ from the pilot manifest.",
  );
}
const byId = new Map(source.cases.map((item) => [item.case_id, item]));
const cases = selection.map(([sourceId, caseId, selectionReason]) => {
  const item = byId.get(sourceId);
  if (!item || !["dev", "eval"].includes(item.split)) {
    throw new Error(`${sourceId}: missing or invalid source case.`);
  }
  const raw = fs.readFileSync(path.join(root, safePath(item.snapshot_path)));
  if (sha256(raw) !== item.sha256 || raw.length !== item.bytes) {
    throw new Error(
      `${sourceId}: source snapshot hash or byte length drifted.`,
    );
  }
  return {
    ...item,
    source_case_id: sourceId,
    original_split: item.split,
    original_stratum: item.stratum,
    case_id: caseId,
    split: "dev",
    stratum: "candidate-pilot",
    selection_reason: selectionReason,
  };
});
const manifest = {
  schema_version: 1,
  pilot_id: "agentci-nine-rule-candidate-dev-micro-pilot-v1",
  purpose:
    "Targeted development-only human test-retest; not an accuracy sample.",
  status: "template",
  review_mode: "test-retest",
  pass_count: 2,
  minimum_washout_days: 7,
  source_benchmark_id: source.benchmark_id,
  source_manifest_sha256: sha256(sourceRaw),
  contract_sha256: sha256(fs.readFileSync(path.join(pilot, "CONTRACT.md"))),
  candidate_scanner_commit: scannerCommit,
  candidate_scanner_source_tree: scannerTree,
  candidate_bundle_sha256: bundleHash,
  historical_eval_reclassified:
    "All v3 eval cases became development data after detector tuning inspected that split; see BENCHMARK.md.",
  selection:
    "Seven predeclared, targeted v3 development challenges selected with prior scanner-design context; no representative accuracy claim.",
  case_count: cases.length,
  annotation_unit_count: 160,
  agent_detection_task: "agentci/agent-usage",
  rules: Object.keys(tasks).filter((task) => task !== "agentci/agent-usage"),
  task_granularity: tasks,
  cases,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agentci-candidate-pilot-"));
let sheetText;
try {
  const tempManifest = path.join(temp, "manifest.json");
  const tempSheet = path.join(temp, "annotation-sheet.csv");
  fs.writeFileSync(tempManifest, manifestText);
  execFileSync(
    process.execPath,
    [
      path.join(root, "scripts/benchmark/generate-annotation-sheet.mjs"),
      "--write",
      tempManifest,
      tempSheet,
    ],
    { cwd: root, stdio: "pipe" },
  );
  sheetText = fs.readFileSync(tempSheet, "utf8");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
if (parseCsv(sheetText).length - 1 !== manifest.annotation_unit_count) {
  throw new Error(
    "Candidate structural unit count changed; review and version the pilot before regenerating.",
  );
}
const [sheetHeader, ...sheetRows] = parseCsv(sheetText);
for (const row of sheetRows) {
  if (
    row[sheetHeader.indexOf("split")] !== "dev" ||
    row[sheetHeader.indexOf("stratum")] !== "candidate-pilot"
  ) {
    throw new Error("Candidate sheet exposed a historical split or stratum.");
  }
  for (const field of [
    "ground_truth",
    "reachability",
    "permissions_status",
    "untrusted_source_status",
    "agent_sink_status",
    "capability_status",
    "mitigation_status",
    "evidence_lines",
    "explanation",
    "notes",
  ]) {
    if (row[sheetHeader.indexOf(field)] !== "")
      throw new Error(`Candidate sheet contains a nonblank ${field}.`);
  }
}
const timingText = renderCsv([
  [
    "case_id",
    "annotator_pseudonym",
    "started_at_utc",
    "completed_at_utc",
    "active_minutes",
    "interruption_minutes",
    "notes",
  ],
  ...cases.map((item) => [item.case_id, "", "", "", "", "", ""]),
]);
const generated = [
  [files.manifest, manifestText],
  [files.sheet, sheetText],
  [files.timing, timingText],
];
if (mode === "--write") {
  if (
    source.status !== "unlabeled" ||
    generated.some(([file]) => fs.existsSync(file))
  ) {
    throw new Error(
      "Refusing to overwrite or regenerate a nonblank candidate pilot.",
    );
  }
  for (const [file, contents] of generated)
    fs.writeFileSync(file, contents, { flag: "wx" });
  console.log(
    "Wrote 7-case, 160-unit nine-rule candidate development micro-pilot.",
  );
} else {
  for (const [file, contents] of generated) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== contents) {
      throw new Error(
        `${path.relative(root, file)} drifted; do not rewrite after labels exist.`,
      );
    }
  }
  if (mode === "--export") exportPacket(path.resolve(argument));
  else
    console.log(
      "Verified candidate development pilot contract, provenance, and 160 blank units.",
    );
}

function exportPacket(destination) {
  if (fs.existsSync(destination))
    throw new Error(`Refusing to overwrite ${destination}.`);
  const packetManifest = {
    schema_version: manifest.schema_version,
    pilot_id: manifest.pilot_id,
    purpose: manifest.purpose,
    status: manifest.status,
    review_mode: manifest.review_mode,
    pass_count: manifest.pass_count,
    minimum_washout_days: manifest.minimum_washout_days,
    source_benchmark_id: manifest.source_benchmark_id,
    source_manifest_sha256: manifest.source_manifest_sha256,
    contract_sha256: manifest.contract_sha256,
    case_count: manifest.case_count,
    annotation_unit_count: manifest.annotation_unit_count,
    agent_detection_task: manifest.agent_detection_task,
    rules: manifest.rules,
    task_granularity: manifest.task_granularity,
    cases: cases.map((item) => ({
      case_id: item.case_id,
      split: "dev",
      stratum: "candidate-pilot",
      repository: item.repository,
      repository_url: item.repository_url,
      source_path: item.source_path,
      source_url: item.source_url,
      source_commit: item.source_commit,
      blob_sha: item.blob_sha,
      sha256: item.sha256,
      bytes: item.bytes,
      license: item.license,
      packet_path: path
        .join("workflows", item.case_id, item.source_path)
        .split(path.sep)
        .join("/"),
    })),
  };
  fs.mkdirSync(destination);
  for (const [sourceFile, target] of [
    [path.join(pilot, "PACKET_README.md"), "README.md"],
    [path.join(pilot, "CONTRACT.md"), "CONTRACT.md"],
    [files.sheet, "annotation-sheet.csv"],
    [files.timing, "timing-sheet.csv"],
  ]) {
    fs.copyFileSync(sourceFile, path.join(destination, target));
  }
  fs.writeFileSync(
    path.join(destination, "manifest.json"),
    `${JSON.stringify(packetManifest, null, 2)}\n`,
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(destination, "SOURCES.md"),
    renderPilotSources(packetManifest.cases),
    { flag: "wx" },
  );
  for (const item of cases) {
    const from = path.join(root, safePath(item.snapshot_path));
    const to = path.join(
      destination,
      "workflows",
      item.case_id,
      safePath(item.source_path),
    );
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  const checksums = walk(destination)
    .sort()
    .map(
      (file) =>
        `${sha256(fs.readFileSync(file))}  ${path.relative(destination, file).split(path.sep).join("/")}`,
    );
  fs.writeFileSync(
    path.join(destination, "CHECKSUMS.sha256"),
    `${checksums.join("\n")}\n`,
    { flag: "wx" },
  );
  console.log(
    `Exported 7-case, 160-unit blank candidate packet to ${destination}.`,
  );
}

function safePath(value) {
  const normalized = path.normalize(value);
  if (
    path.isAbsolute(value) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Unsafe packet path ${value}.`);
  }
  return normalized;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(candidate)
      : entry.isFile()
        ? [candidate]
        : [];
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function git(...arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}
