#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const [manifestArgument, ...extra] = process.argv.slice(2);
if (!manifestArgument || extra.length) {
  throw new Error("Usage: verify-v4-intake.mjs <future-v4-manifest.json>");
}

const manifestFile = path.resolve(manifestArgument);
if (fs.lstatSync(manifestFile).isSymbolicLink()) {
  throw new Error("The v4 manifest must not be a symlink.");
}
const intakeRoot = path.dirname(fs.realpathSync(manifestFile));
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const manifestFields = [
  "schema_version",
  "benchmark_id",
  "status",
  "frozen_at",
  "workflow_count",
  "repository_count",
  "scanner_commit",
  "scanner_source_tree",
  "scanner_bundle_sha256",
  "protocol_path",
  "protocol_sha256",
  "sampling_plan_path",
  "sampling_plan_sha256",
  "agent_detection_task",
  "rules",
  "task_granularity",
  "cases",
];
if (!exactFields(manifest, manifestFields)) {
  throw new Error("The v4 intake manifest has missing or unexpected fields.");
}
for (const name of ["labels", "predictions", "results"]) {
  if (fs.existsSync(path.join(intakeRoot, name))) {
    throw new Error("Intake must precede labels, predictions, and results.");
  }
}
const exclusions = [
  ["benchmark/archive/agentci-real-workflows-v1/manifest.json", "v1"],
  ["benchmark/archive/agentci-real-workflows-v2/manifest.json", "v2"],
  ["benchmark/manifest.json", "v3"],
].map(([relative, version]) => {
  const candidate = JSON.parse(
    fs.readFileSync(path.join(root, relative), "utf8"),
  );
  if (candidate.benchmark_id !== `agentci-real-workflows-${version}`) {
    throw new Error(`The ${version} development exclusion manifest drifted.`);
  }
  return candidate;
});

const scopes = {
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
const rules = Object.keys(scopes).filter(
  (rule) => rule !== "agentci/agent-usage",
);
if (
  manifest.schema_version !== 1 ||
  manifest.benchmark_id !== "agentci-real-workflows-v4" ||
  manifest.status !== "unlabeled" ||
  typeof manifest.frozen_at !== "string" ||
  !Number.isFinite(Date.parse(manifest.frozen_at)) ||
  new Date(manifest.frozen_at).toISOString() !== manifest.frozen_at ||
  manifest.agent_detection_task !== "agentci/agent-usage" ||
  !Array.isArray(manifest.rules) ||
  manifest.rules.length !== rules.length ||
  new Set(manifest.rules).size !== rules.length ||
  rules.some((rule) => !manifest.rules.includes(rule)) ||
  !manifest.task_granularity ||
  Object.keys(manifest.task_granularity).length !==
    Object.keys(scopes).length ||
  Object.entries(scopes).some(
    ([rule, scope]) => manifest.task_granularity[rule] !== scope,
  )
) {
  throw new Error(
    "Invalid v4 schema, identity, freeze timestamp, unlabeled status, or nine-rule registry.",
  );
}
if (manifest.protocol_path === manifest.sampling_plan_path) {
  throw new Error("Human protocol and sampling plan must be separate files.");
}

for (const field of [
  "scanner_commit",
  "scanner_source_tree",
  "scanner_bundle_sha256",
  "protocol_sha256",
  "sampling_plan_sha256",
]) {
  const length = field.endsWith("sha256") ? 64 : 40;
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(manifest[field])) {
    throw new Error(`Invalid ${field} pin.`);
  }
}
const commit = manifest.scanner_commit;
if (git("rev-parse", `${commit}^{commit}`).toString("utf8").trim() !== commit) {
  throw new Error("Scanner pin is not a commit.");
}
if (
  git("rev-parse", `${commit}:src`).toString("utf8").trim() !==
    manifest.scanner_source_tree ||
  sha256(git("show", `${commit}:dist/index.js`)) !==
    manifest.scanner_bundle_sha256
) {
  throw new Error("Pinned scanner source or bundle differs from the manifest.");
}
// shortcut: rules.ts uses literal quoted keys; update this check if rule declarations change shape.
const pinnedRules = [
  ...git("show", `${commit}:src/rules.ts`)
    .toString("utf8")
    .matchAll(/^\s*"(agentci\/[^\"]+)":\s*\{/gm),
].map((match) => match[1]);
if (
  pinnedRules.length !== rules.length ||
  new Set(pinnedRules).size !== rules.length ||
  rules.some((rule) => !pinnedRules.includes(rule))
) {
  throw new Error(
    "Pinned scanner rule registry is not the nine-rule v4 registry.",
  );
}
for (const [fileField, hashField] of [
  ["protocol_path", "protocol_sha256"],
  ["sampling_plan_path", "sampling_plan_sha256"],
]) {
  const content = readInside(intakeRoot, manifest[fileField]);
  if (content.length === 0 || sha256(content) !== manifest[hashField]) {
    throw new Error(`${fileField} differs from its frozen hash.`);
  }
}

if (
  !Array.isArray(manifest.cases) ||
  manifest.cases.length === 0 ||
  manifest.workflow_count !== manifest.cases.length ||
  manifest.repository_count !== manifest.cases.length
) {
  throw new Error("v4 must list nonempty, one-workflow-per-repository cases.");
}
const oldRepositories = new Set(
  exclusions.flatMap((source) =>
    source.cases.map((item) => item.repository.toLowerCase()),
  ),
);
const oldContent = new Set(
  exclusions.flatMap((source) => source.cases.map((item) => item.sha256)),
);
const seenRepositories = new Set();
const seenIds = new Set();
const seenContent = new Set();
for (const [index, item] of manifest.cases.entries()) {
  const label = `case ${index + 1}`;
  if (
    !exactFields(item, [
      "case_id",
      "split",
      "stratum",
      "repository",
      "repository_url",
      "source_path",
      "source_url",
      "source_commit",
      "blob_sha",
      "sha256",
      "bytes",
      "license",
      "snapshot_path",
    ])
  ) {
    throw new Error(`${label}: missing or unexpected fields.`);
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item.case_id) ||
    item.split !== "eval" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repository) ||
    !/^[A-Za-z0-9_.-]+$/.test(item.stratum) ||
    !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(item.source_path) ||
    !/^[a-f0-9]{40}$/.test(item.source_commit) ||
    !/^[a-f0-9]{40}$/.test(item.blob_sha) ||
    !/^[a-f0-9]{64}$/.test(item.sha256) ||
    !Number.isSafeInteger(item.bytes) ||
    item.bytes < 1 ||
    typeof item.license !== "string" ||
    item.license === "" ||
    ["NOASSERTION", "Other"].includes(item.license)
  ) {
    throw new Error(`${label}: invalid source metadata.`);
  }
  if (
    item.repository_url !== `https://github.com/${item.repository}` ||
    item.source_url !==
      `https://github.com/${item.repository}/blob/${item.source_commit}/${item.source_path}`
  ) {
    throw new Error(
      `${label}: source URL is not pinned to its repository and commit.`,
    );
  }
  const repository = item.repository.toLowerCase();
  if (oldRepositories.has(repository) || seenRepositories.has(repository)) {
    throw new Error(
      `${label}: repository overlaps development or another v4 case.`,
    );
  }
  if (seenIds.has(item.case_id)) {
    throw new Error(`${label}: duplicate case ID.`);
  }
  const expectedPath = `snapshots/${item.case_id}/${item.source_path}`;
  if (item.snapshot_path !== expectedPath) {
    throw new Error(`${label}: snapshot path must be ${expectedPath}.`);
  }
  const content = readInside(intakeRoot, item.snapshot_path);
  if (
    content.length !== item.bytes ||
    sha256(content) !== item.sha256 ||
    crypto
      .createHash("sha1")
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest("hex") !== item.blob_sha
  ) {
    throw new Error(
      `${label}: snapshot bytes, SHA-256, or Git blob SHA differ.`,
    );
  }
  if (oldContent.has(item.sha256) || seenContent.has(item.sha256)) {
    throw new Error(
      `${label}: workflow bytes duplicate development or another v4 case.`,
    );
  }
  seenRepositories.add(repository);
  seenIds.add(item.case_id);
  seenContent.add(item.sha256);
}
console.log(
  `Verified ${manifest.cases.length} unlabeled v4 intake cases; no workflows were scanned.`,
);

function readInside(base, relative) {
  if (
    typeof relative !== "string" ||
    relative === "" ||
    relative.includes("\\") ||
    relative
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      "Intake file path must stay inside its manifest directory.",
    );
  }
  let file = base;
  for (const segment of relative.split("/")) {
    file = path.join(file, segment);
    if (fs.lstatSync(file).isSymbolicLink()) {
      throw new Error("Intake files must not use symlinks.");
    }
  }
  return fs.readFileSync(file);
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function exactFields(value, fields) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}
