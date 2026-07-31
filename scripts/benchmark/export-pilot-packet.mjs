#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputArgument = process.argv[2];
if (!outputArgument) {
  throw new Error(
    "Usage: node scripts/benchmark/export-pilot-packet.mjs <new-output-directory>",
  );
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const outputRoot = path.resolve(outputArgument);
if (fs.existsSync(outputRoot)) {
  throw new Error(
    `Refusing to overwrite existing packet destination ${outputRoot}.`,
  );
}
fs.mkdirSync(outputRoot);

const pilotRoot = path.join(repositoryRoot, "benchmark", "pilot");
const pilotManifest = JSON.parse(
  fs.readFileSync(path.join(pilotRoot, "manifest.json"), "utf8"),
);
if (
  pilotManifest.status !== "template" ||
  pilotManifest.split !== "dev" ||
  pilotManifest.evaluation_content_inspected_for_selection !== false
) {
  throw new Error("Pilot manifest is not a blind development-only template.");
}

for (const [source, destination] of [
  ["benchmark/pilot/PACKET_README.md", "README.md"],
  ["ANNOTATION_GUIDE.md", "ANNOTATION_GUIDE.md"],
  ["RULES.md", "RULES.md"],
  ["docs/analysis-model.md", "analysis-model.md"],
  ["benchmark/pilot/manifest.json", "manifest.json"],
  ["benchmark/pilot/annotation-sheet.csv", "annotation-sheet.csv"],
  ["benchmark/pilot/timing-sheet.csv", "timing-sheet.csv"],
]) {
  copy(source, destination);
}

for (const item of pilotManifest.cases) {
  const source = path.join(repositoryRoot, item.snapshot_path);
  const digest = sha256(fs.readFileSync(source));
  if (digest !== item.source_sha256) {
    throw new Error(
      `${item.case_id}: snapshot SHA-256 ${digest} does not match pilot manifest.`,
    );
  }
  const destination = safeRelativePath(
    path.join(
      "workflows",
      safeRelativePath(item.case_id),
      safeRelativePath(item.source_path),
    ),
  );
  copy(path.relative(repositoryRoot, source), destination);
}

fs.writeFileSync(
  path.join(outputRoot, "SOURCES.md"),
  renderSources(pilotManifest.cases),
);
const packetFiles = walk(outputRoot).sort();
const checksumRows = packetFiles.map((file) => {
  const relative = path.relative(outputRoot, file).split(path.sep).join("/");
  return `${sha256(fs.readFileSync(file))}  ${relative}`;
});
fs.writeFileSync(
  path.join(outputRoot, "CHECKSUMS.sha256"),
  `${checksumRows.join("\n")}\n`,
);
console.log(
  `Exported blind pilot packet with ${pilotManifest.case_count} development workflows and ${pilotManifest.annotation_unit_count} blank units to ${outputRoot}.`,
);

function copy(sourceRelative, destinationRelative) {
  const source = path.join(repositoryRoot, safeRelativePath(sourceRelative));
  const destination = path.join(
    outputRoot,
    safeRelativePath(destinationRelative),
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function safeRelativePath(value) {
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

function renderSources(cases) {
  const rows = [
    "# Frozen workflow sources",
    "",
    "The packet contains only the exact development snapshots identified below.",
    "",
    "| Case | Repository | Commit | Workflow | SPDX | Frozen source |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of cases) {
    rows.push(
      `| ${item.case_id} | [${item.repository}](${item.repository_url}) | \`${item.source_commit}\` | \`${item.source_path}\` | \`${item.license}\` | [source](${item.source_url}) |`,
    );
  }
  return `${rows.join("\n")}\n`;
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
