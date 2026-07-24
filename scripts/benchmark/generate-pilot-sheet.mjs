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
const pilotRoot = path.join(benchmarkRoot, "pilot");
const sourceManifestPath = path.join(benchmarkRoot, "manifest.json");
const sourceRegistryPath = path.join(benchmarkRoot, "annotation-sheet.csv");
const pilotManifestPath = path.join(pilotRoot, "manifest.json");
const pilotRegistryPath = path.join(pilotRoot, "annotation-sheet.csv");
const timingTemplatePath = path.join(pilotRoot, "timing-sheet.csv");
const pilotId = "agentci-v0.1.1-annotation-feasibility-v1";
const selectionSeed = "agentci-guard-annotation-pilot-v1";
const mode = process.argv[2] ?? "--check";
if (!["--check", "--write"].includes(mode)) {
  throw new Error("Expected --check or --write.");
}
const sourceManifestRaw = fs.readFileSync(sourceManifestPath, "utf8");
const sourceRegistryRaw = fs.readFileSync(sourceRegistryPath, "utf8");
const sourceManifest = JSON.parse(sourceManifestRaw);
const [header, ...sourceRows] = parseCsv(sourceRegistryRaw);
const column = Object.fromEntries(header.map((name, index) => [name, index]));

for (const required of ["unit_id", "case_id", "split", "stratum"]) {
  if (!Number.isInteger(column[required])) {
    throw new Error(`Source annotation registry is missing ${required}.`);
  }
}
if (mode === "--write" && sourceManifest.status !== "unlabeled") {
  throw new Error(
    "The feasibility pilot may only be rewritten while the benchmark is unlabeled.",
  );
}

const sourceCases = new Map(
  sourceManifest.cases.map((item) => [item.case_id, item]),
);
const unitCounts = new Map();
for (const row of sourceRows) {
  const caseId = row[column.case_id];
  const item = sourceCases.get(caseId);
  if (!item) throw new Error(`Unknown source case ${caseId}.`);
  if (
    row[column.split] !== item.split ||
    row[column.stratum] !== item.stratum
  ) {
    throw new Error(`${caseId}: annotation registry provenance drifted.`);
  }
  unitCounts.set(caseId, (unitCounts.get(caseId) ?? 0) + 1);
}

const developmentCases = sourceManifest.cases.filter(
  (item) => item.split === "dev",
);
const casesByStratum = groupBy(developmentCases, (item) => item.stratum);
const selected = [];
for (const [stratum, cases] of [...casesByStratum].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  const counts = cases
    .map((item) => requiredUnitCount(item.case_id))
    .sort((left, right) => left - right);
  const median = medianOf(counts);
  const [chosen] = cases
    .map((item) => ({
      item,
      unitCount: requiredUnitCount(item.case_id),
      distanceFromMedian: Math.abs(requiredUnitCount(item.case_id) - median),
      tieBreak: sha256(`${selectionSeed}:${item.case_id}`),
    }))
    .sort(
      (left, right) =>
        left.distanceFromMedian - right.distanceFromMedian ||
        left.tieBreak.localeCompare(right.tieBreak),
    );
  if (!chosen) throw new Error(`Development stratum ${stratum} is empty.`);
  selected.push({
    case_id: chosen.item.case_id,
    stratum,
    repository: chosen.item.repository,
    repository_url: chosen.item.repository_url,
    source_path: chosen.item.source_path,
    source_url: chosen.item.source_url,
    source_commit: chosen.item.source_commit,
    source_sha256: chosen.item.sha256,
    license: chosen.item.license,
    snapshot_path: chosen.item.snapshot_path,
    annotation_unit_count: chosen.unitCount,
    stratum_median_unit_count: median,
  });
}

const selectedIds = new Set(selected.map((item) => item.case_id));
const pilotRows = sourceRows.filter((row) =>
  selectedIds.has(row[column.case_id]),
);
if (
  pilotRows.some((row) => row[column.split] !== "dev") ||
  new Set(pilotRows.map((row) => row[column.case_id])).size !== selected.length
) {
  throw new Error("Pilot selection contains non-development or missing cases.");
}
for (const row of pilotRows) {
  for (const field of [
    "ground_truth",
    "reachability",
    "permissions_status",
    "effective_permissions",
    "untrusted_source_status",
    "untrusted_source",
    "agent_sink_status",
    "agent_sink",
    "capability_status",
    "capability",
    "mitigation_status",
    "mitigation",
    "evidence_lines",
    "explanation",
    "notes",
  ]) {
    if (row[column[field]] !== "") {
      throw new Error(`Source registry contains a nonblank ${field} value.`);
    }
  }
}

const pilotManifest = {
  schema_version: 1,
  pilot_id: pilotId,
  purpose:
    "Development-only blind annotation feasibility and agreement pilot; not accuracy evidence.",
  status: "template",
  source_benchmark_id: sourceManifest.benchmark_id,
  source_frozen_at: sourceManifest.frozen_at,
  source_selection_inputs_sha256: sha256(
    JSON.stringify({
      benchmark_id: sourceManifest.benchmark_id,
      cases: sourceManifest.cases.map((item) => ({
        case_id: item.case_id,
        split: item.split,
        stratum: item.stratum,
        repository: item.repository,
        source_path: item.source_path,
        source_commit: item.source_commit,
        sha256: item.sha256,
        snapshot_path: item.snapshot_path,
      })),
    }),
  ),
  source_annotation_registry_sha256: sha256(sourceRegistryRaw),
  split: "dev",
  evaluation_content_inspected_for_selection: false,
  selection: {
    seed: selectionSeed,
    method:
      "Select one development case per stratum with annotation-unit count nearest that stratum median; break ties by SHA-256(seed:case_id).",
    cases_per_stratum: 1,
    content_fields_used: [
      "case_id",
      "split",
      "stratum",
      "annotation_unit_count",
    ],
  },
  case_count: selected.length,
  annotation_unit_count: pilotRows.length,
  cases: selected,
};
const pilotManifestRendered = `${JSON.stringify(pilotManifest, null, 2)}\n`;
const pilotRegistryRendered = renderCsv([header, ...pilotRows]);
const timingRendered = renderCsv([
  [
    "case_id",
    "stratum",
    "unit_count",
    "annotator_pseudonym",
    "started_at_utc",
    "completed_at_utc",
    "active_minutes",
    "interruption_minutes",
    "notes",
  ],
  ...selected.map((item) => [
    item.case_id,
    item.stratum,
    item.annotation_unit_count,
    "",
    "",
    "",
    "",
    "",
    "",
  ]),
]);

if (mode === "--write") {
  fs.mkdirSync(pilotRoot, { recursive: true });
  fs.writeFileSync(pilotManifestPath, pilotManifestRendered);
  fs.writeFileSync(pilotRegistryPath, pilotRegistryRendered);
  fs.writeFileSync(timingTemplatePath, timingRendered);
  console.log(
    `Wrote ${selected.length}-case, ${pilotRows.length}-unit development-only annotation pilot.`,
  );
} else if (mode === "--check") {
  checkGenerated(pilotManifestPath, pilotManifestRendered);
  checkGenerated(pilotRegistryPath, pilotRegistryRendered);
  checkGenerated(timingTemplatePath, timingRendered);
  console.log(
    `Verified ${selected.length}-case, ${pilotRows.length}-unit development-only annotation pilot without consulting scanner predictions or evaluation content.`,
  );
}

function requiredUnitCount(caseId) {
  const count = unitCounts.get(caseId);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${caseId}: annotation unit count is missing.`);
  }
  return count;
}

function medianOf(values) {
  if (values.length === 0) throw new Error("Cannot calculate an empty median.");
  const midpoint = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[midpoint]
    : (values[midpoint - 1] + values[midpoint]) / 2;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function groupBy(values, key) {
  const output = new Map();
  for (const value of values) {
    const group = key(value);
    output.set(group, [...(output.get(group) ?? []), value]);
  }
  return output;
}

function checkGenerated(file, expected) {
  const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (actual !== expected) {
    throw new Error(
      `${path.relative(repositoryRoot, file)} is stale; run node scripts/benchmark/generate-pilot-sheet.mjs --write`,
    );
  }
}
