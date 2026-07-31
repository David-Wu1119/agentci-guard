#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { benchmarkRoot, repositoryRoot } from "./annotation-lib.mjs";

const manifestPath = path.join(benchmarkRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const query = "actions/checkout path:.github/workflows";
const searchLimit = 300;
const seed = "agentci-guard-control-path-correction-v2";
if (manifest.benchmark_id !== "agentci-real-workflows-v2") {
  throw new Error("Control-path correction requires the v2 candidate corpus.");
}
if (manifest.control_path_correction) {
  throw new Error("Control-path correction has already been applied.");
}

const invalid = manifest.cases.filter(
  (item) =>
    item.stratum === "control" &&
    !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(item.source_path),
);
if (invalid.length === 0) {
  throw new Error("No mis-cased control paths were found.");
}
const excludedRepositories = new Set(
  manifest.cases.map((item) => item.repository),
);
const results = githubJson([
  "search",
  "code",
  query,
  "--limit",
  String(searchLimit),
  "--json",
  "repository,path,sha,url",
])
  .filter(
    (candidate) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(candidate.path) &&
      !candidate.repository.isPrivate &&
      !candidate.repository.isFork,
  )
  .sort((left, right) => sampleKey(left).localeCompare(sampleKey(right)));
const additions = [];
const snapshotContents = new Map();
for (const candidate of results) {
  if (additions.length >= invalid.length) break;
  const repository = candidate.repository.nameWithOwner;
  if (excludedRepositories.has(repository)) continue;
  const commit = commitFromUrl(candidate.url);
  let content;
  let metadata;
  try {
    content = githubRaw(repository, candidate.path, commit);
    if (!/actions\/checkout@/i.test(content)) continue;
    metadata = githubJson(["api", `repos/${repository}`]);
  } catch (error) {
    console.warn(
      `Skipping ${repository}/${candidate.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    continue;
  }
  const license = metadata.license?.spdx_id;
  if (!license || license === "NOASSERTION" || license === "Other") {
    continue;
  }

  excludedRepositories.add(repository);
  const caseId = `control-v2-${String(additions.length + 1).padStart(3, "0")}`;
  const snapshotPath = path.join(
    "benchmark",
    "snapshots",
    caseId,
    candidate.path,
  );
  snapshotContents.set(snapshotPath, content);
  additions.push({
    case_id: caseId,
    split: splitFor(repository),
    stratum: "control",
    repository,
    repository_url: candidate.repository.url,
    source_path: candidate.path,
    source_url: candidate.url,
    source_commit: commit,
    blob_sha: candidate.sha,
    sha256: sha256(content),
    bytes: Buffer.byteLength(content),
    license,
    selection_round: "control-path-correction-v2",
    selection_key: sampleKey(candidate),
    snapshot_path: snapshotPath.split(path.sep).join("/"),
  });
}
if (additions.length !== invalid.length) {
  throw new Error(
    `Selected ${additions.length}/${invalid.length} replacement controls; no files were written.`,
  );
}

for (const [snapshotPath, content] of snapshotContents) {
  const absolute = path.join(repositoryRoot, snapshotPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}
const invalidIds = new Set(invalid.map((item) => item.case_id));
manifest.cases = manifest.cases.filter((item) => !invalidIds.has(item.case_id));
manifest.cases.push(...additions);
manifest.frozen_at = new Date().toISOString();
manifest.control_path_correction = {
  seed,
  query,
  requested_results: searchLimit,
  path_eligible_results: results.length,
  excluded_case_ids: [...invalidIds].sort(),
  exclusion_reason:
    "The source path was not an exact-case direct child of .github/workflows and therefore was not an active GitHub Actions workflow path.",
  replacement_case_ids: additions.map((item) => item.case_id),
};
manifest.sampling_frame.push({
  id: "control-path-correction-v2",
  query,
  requested_results: searchLimit,
  path_eligible_results: results.length,
  selected_results: additions.length,
});
manifest.workflow_count = manifest.cases.length;
manifest.repository_count = new Set(
  manifest.cases.map((item) => item.repository),
).size;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
appendThirdPartyNotices(additions);
console.log(
  `Replaced ${invalid.length} mis-cased control paths; v2 remains ${manifest.workflow_count} workflows from ${manifest.repository_count} repositories.`,
);

function githubJson(arguments_) {
  return JSON.parse(
    execFileSync("gh", arguments_, {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }),
  );
}

function githubRaw(repository, workflowPath, commit) {
  return execFileSync(
    "gh",
    [
      "api",
      `repos/${repository}/contents/${workflowPath}`,
      "--method",
      "GET",
      "-f",
      `ref=${commit}`,
      "-H",
      "Accept: application/vnd.github.raw+json",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

function sampleKey(candidate) {
  return sha256(
    `${seed}:${candidate.repository.nameWithOwner}:${candidate.path}:${candidate.url}`,
  );
}

function splitFor(repository) {
  const digest = crypto
    .createHash("sha256")
    .update(`${manifest.collection_seed}:${repository}`)
    .digest();
  return digest.readUInt32BE(0) % 3 === 0 ? "dev" : "eval";
}

function commitFromUrl(url) {
  const match = /\/blob\/([a-f0-9]{40})\//i.exec(url);
  if (!match) throw new Error(`Could not extract commit from ${url}.`);
  return match[1];
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function appendThirdPartyNotices(cases) {
  const noticePath = path.join(benchmarkRoot, "THIRD_PARTY_NOTICES.md");
  const lines = fs.readFileSync(noticePath, "utf8").trimEnd().split("\n");
  for (const item of cases) {
    lines.push(
      `| ${item.case_id} | [${item.repository}](${item.repository_url}) | [${item.source_commit.slice(0, 12)}](${item.source_url}) | \`${item.source_path}\` | ${item.license} |`,
    );
  }
  lines.push("");
  fs.writeFileSync(noticePath, lines.join("\n"));
}
