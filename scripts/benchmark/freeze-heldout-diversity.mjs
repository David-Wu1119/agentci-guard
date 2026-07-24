#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { benchmarkRoot, repositoryRoot } from "./annotation-lib.mjs";

const manifestPath = path.join(benchmarkRoot, "manifest.json");
const archiveRoot = path.join(
  benchmarkRoot,
  "archive",
  "agentci-real-workflows-v2",
);
const targetPerConfiguration = 4;
const searchLimit = 200;
const seed = "agentci-guard-heldout-diversity-v3";
const configurations = [
  {
    id: "codex-action",
    prefix: "holdout-codex",
    query: '"openai/codex-action" path:.github/workflows',
    evidence: /openai\/codex-action/i,
  },
  {
    id: "aider-cli",
    prefix: "holdout-aider",
    query: '"aider" path:.github/workflows',
    evidence:
      /(?:aider-ai\/aider|aider-chat|(?:^|[\s"'`])(?:uvx\s+)?aider(?:\s|$))/im,
  },
  {
    id: "cursor-agent-cli",
    prefix: "holdout-cursor",
    query: '"cursor-agent" path:.github/workflows',
    evidence: /\bcursor-agent\b/i,
  },
  {
    id: "openhands",
    prefix: "holdout-openhands",
    query: '"openhands" path:.github/workflows',
    evidence:
      /(?:all-hands-ai\/|ghcr\.io\/(?:all-hands-ai\/)?openhands|openhands-resolver|(?:^|[\s"'`])openhands(?:\s|$))/im,
  },
];

const manifestText = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
if (
  manifest.benchmark_id !== "agentci-real-workflows-v2" ||
  manifest.status !== "unlabeled"
) {
  throw new Error(
    "Held-out correction requires the unlabeled v2 candidate corpus.",
  );
}
if (fs.existsSync(archiveRoot)) {
  throw new Error(`${archiveRoot} already exists; correction is one-shot.`);
}

const inspected = manifest.cases.filter(
  (item) =>
    item.selection_round !== "control-path-correction-v2" &&
    typeof item.configuration_family === "string",
);
if (inspected.length !== configurations.length * targetPerConfiguration) {
  throw new Error(
    `Expected 16 inspected diversity cases, found ${inspected.length}.`,
  );
}

const selectedRepositories = new Set(
  manifest.cases.map((item) => item.repository),
);
const additions = [];
const snapshotContents = new Map();
const frameMetadata = [];
for (const configuration of configurations) {
  const results = githubJson([
    "search",
    "code",
    configuration.query,
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
    .sort((left, right) =>
      sampleKey(configuration.id, left).localeCompare(
        sampleKey(configuration.id, right),
      ),
    );

  let contentMatches = 0;
  let selected = 0;
  for (const candidate of results) {
    if (selected >= targetPerConfiguration) break;
    const repository = candidate.repository.nameWithOwner;
    if (selectedRepositories.has(repository)) continue;
    const commit = commitFromUrl(candidate.url);
    let content;
    let metadata;
    try {
      content = githubRaw(repository, candidate.path, commit);
      if (!configuration.evidence.test(content)) continue;
      contentMatches++;
      metadata = githubJson(["api", `repos/${repository}`]);
    } catch (error) {
      console.warn(
        `Skipped an inaccessible candidate: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    const license = metadata.license?.spdx_id;
    if (!license || license === "NOASSERTION" || license === "Other") continue;

    selected++;
    selectedRepositories.add(repository);
    const caseId = `${configuration.prefix}-${String(selected).padStart(3, "0")}`;
    const snapshotPath = path.join(
      "benchmark",
      "snapshots",
      caseId,
      candidate.path,
    );
    snapshotContents.set(snapshotPath, content);
    additions.push({
      case_id: caseId,
      split: "eval",
      stratum: `heldout-agent-diversity-${configuration.id}`,
      repository,
      repository_url: candidate.repository.url,
      source_path: candidate.path,
      source_url: candidate.url,
      source_commit: commit,
      blob_sha: candidate.sha,
      sha256: sha256(content),
      bytes: Buffer.byteLength(content),
      license,
      configuration_family: configuration.id,
      selection_round: "heldout-diversity-v3",
      selection_key: sampleKey(configuration.id, candidate),
      snapshot_path: snapshotPath.split(path.sep).join("/"),
    });
  }
  if (selected !== targetPerConfiguration) {
    throw new Error(
      `${configuration.id}: selected ${selected}/${targetPerConfiguration}; no files were written.`,
    );
  }
  frameMetadata.push({
    id: `heldout-agent-diversity-${configuration.id}`,
    query: configuration.query,
    requested_results: searchLimit,
    path_eligible_results: results.length,
    inspected_configuration_matches: contentMatches,
    selected_results: selected,
  });
}

for (const [snapshotPath, content] of snapshotContents) {
  const absolute = path.join(repositoryRoot, snapshotPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}
fs.mkdirSync(archiveRoot, { recursive: true });
fs.writeFileSync(path.join(archiveRoot, "manifest.json"), manifestText);
fs.writeFileSync(
  path.join(archiveRoot, "README.md"),
  [
    "# Superseded v2 Candidate Corpus",
    "",
    "This manifest preserves the unlabeled v2 candidate before its evaluation",
    "split was corrected. During pre-label classifier work, the 16 targeted",
    "agent-diversity snapshots were inspected. They therefore could not remain",
    "held out. V3 moves all 16 to development and adds 16 deterministically",
    "selected replacements whose contents were not used for scanner changes.",
    "",
    "No human labels, scanner predictions, or accuracy metrics were produced",
    "from v2. Referenced snapshots remain immutable and are shared with v3.",
    "",
  ].join("\n"),
);

for (const item of inspected) {
  item.split = "dev";
  item.selection_round = "inspected-before-heldout-freeze-v3";
}
manifest.benchmark_id = "agentci-real-workflows-v3";
manifest.frozen_at = new Date().toISOString();
manifest.split_method =
  "repository-disjoint; base frames use sha256(seed:repository) first uint32 modulo 3 (0 => dev, otherwise eval); v3 reclassifies the 16 inspected diversity cases to dev and assigns the 16 unseen replacements to eval using the explicit frozen ID lists";
manifest.supersedes = {
  benchmark_id: "agentci-real-workflows-v2",
  manifest: "benchmark/archive/agentci-real-workflows-v2/manifest.json",
  reason:
    "The v2 targeted diversity snapshots influenced pre-label detector corrections and were moved to development before any human labeling or evaluation.",
};
manifest.heldout_diversity_collection_seed = seed;
manifest.heldout_diversity_target_per_configuration = targetPerConfiguration;
manifest.development_reclassified_case_ids = inspected
  .map((item) => item.case_id)
  .sort();
manifest.heldout_case_ids = additions.map((item) => item.case_id).sort();
manifest.sampling_frame.push(...frameMetadata);
manifest.cases.push(...additions);
manifest.workflow_count = manifest.cases.length;
manifest.repository_count = new Set(
  manifest.cases.map((item) => item.repository),
).size;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
appendThirdPartyNotices(additions);
console.log(
  `Created ${manifest.benchmark_id}: ${inspected.length} inspected cases moved to development and ${additions.length} unseen replacements frozen for evaluation.`,
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

function sampleKey(configuration, candidate) {
  return sha256(
    `${seed}:${configuration}:${candidate.repository.nameWithOwner}:${candidate.path}:${candidate.url}`,
  );
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
