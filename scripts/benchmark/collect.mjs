#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const benchmarkRoot = path.join(repositoryRoot, "benchmark");
const snapshotRoot = path.join(benchmarkRoot, "snapshots");
const targetPerStratum = 60;
const searchLimit = 300;
const seed = "agentci-guard-benchmark-v1";
const rules = [
  "agentci/untrusted-ai-write-token",
  "agentci/pull-request-target-ai",
  "agentci/ai-with-secrets",
  "agentci/untrusted-input-in-prompt",
  "agentci/ai-shell-access",
  "agentci/broad-write-permissions",
  "agentci/unpinned-ai-action",
  "agentci/unsafe-checkout",
];
const strata = [
  {
    id: "ai-enriched",
    prefix: "ai",
    query: "anthropics/claude-code-action path:.github/workflows",
  },
  {
    id: "control",
    prefix: "control",
    query: "actions/checkout path:.github/workflows",
  },
];

if (
  fs.existsSync(snapshotRoot) ||
  fs.existsSync(path.join(benchmarkRoot, "manifest.json"))
) {
  throw new Error(
    "benchmark snapshot already exists; collection is immutable. Move to a new benchmark version instead of overwriting it.",
  );
}

fs.mkdirSync(snapshotRoot, { recursive: true });
const selectedRepositories = new Set();
const manifestCases = [];
const frameMetadata = [];

for (const stratum of strata) {
  const searchResults = githubJson([
    "search",
    "code",
    stratum.query,
    "--limit",
    String(searchLimit),
    "--json",
    "repository,path,sha,url",
  ]);
  const eligible = searchResults
    .filter(
      (item) =>
        /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(item.path) &&
        !item.repository.isPrivate &&
        !item.repository.isFork,
    )
    .sort((left, right) => sampleKey(left).localeCompare(sampleKey(right)));
  frameMetadata.push({
    id: stratum.id,
    query: stratum.query,
    requested_results: searchLimit,
    eligible_results: eligible.length,
  });

  let selected = 0;
  for (const candidate of eligible) {
    if (selected >= targetPerStratum) break;
    const repository = candidate.repository.nameWithOwner;
    if (selectedRepositories.has(repository)) continue;

    let repositoryMetadata;
    try {
      repositoryMetadata = githubJson(["api", `repos/${repository}`]);
    } catch (error) {
      console.warn(`Skipping ${repository}: ${error.message}`);
      continue;
    }
    const license = repositoryMetadata.license?.spdx_id;
    if (
      !license ||
      license === "NOASSERTION" ||
      repositoryMetadata.archived ||
      repositoryMetadata.disabled
    ) {
      continue;
    }

    let blob;
    try {
      blob = githubJson([
        "api",
        `repos/${repository}/git/blobs/${candidate.sha}`,
      ]);
    } catch (error) {
      console.warn(
        `Skipping ${repository}/${candidate.path}: ${error.message}`,
      );
      continue;
    }
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      continue;
    }
    const content = Buffer.from(blob.content.replace(/\n/g, ""), "base64");
    if (content.length === 0 || content.length > 250_000) continue;

    selected++;
    selectedRepositories.add(repository);
    const caseId = `${stratum.prefix}-${String(selected).padStart(3, "0")}`;
    const sourceCommit = commitFromUrl(candidate.url);
    const split = splitForRepository(repository);
    const destinationDirectory = path.join(snapshotRoot, caseId);
    const destination = path.join(
      destinationDirectory,
      ".github",
      "workflows",
      path.basename(candidate.path),
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);

    manifestCases.push({
      case_id: caseId,
      split,
      stratum: stratum.id,
      repository,
      repository_url: candidate.repository.url,
      source_path: candidate.path,
      source_url: candidate.url,
      source_commit: sourceCommit,
      blob_sha: candidate.sha,
      sha256: sha256(content),
      bytes: content.length,
      license,
      snapshot_path: path.relative(repositoryRoot, destination),
    });
  }
  if (selected < targetPerStratum) {
    throw new Error(
      `Only selected ${selected}/${targetPerStratum} cases for ${stratum.id}.`,
    );
  }
}

manifestCases.sort((left, right) => left.case_id.localeCompare(right.case_id));
const manifest = {
  schema_version: 1,
  benchmark_id: "agentci-real-workflows-v1",
  status: "unlabeled",
  frozen_at: new Date().toISOString(),
  collection_seed: seed,
  target_per_stratum: targetPerStratum,
  sampling_frame: frameMetadata,
  split_method:
    "repository-disjoint; sha256(seed:repository) first uint32 modulo 3 equals 0 => dev, otherwise eval",
  workflow_count: manifestCases.length,
  repository_count: new Set(manifestCases.map((item) => item.repository)).size,
  rules,
  cases: manifestCases,
};
fs.writeFileSync(
  path.join(benchmarkRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(benchmarkRoot, "annotation-sheet.csv"),
  annotationCsv(manifestCases),
);
fs.writeFileSync(
  path.join(benchmarkRoot, "THIRD_PARTY_NOTICES.md"),
  thirdPartyNotices(manifestCases),
);
console.log(
  `Frozen ${manifest.workflow_count} workflows from ${manifest.repository_count} repositories.`,
);
console.log(
  `dev=${manifestCases.filter((item) => item.split === "dev").length} eval=${manifestCases.filter((item) => item.split === "eval").length}`,
);

function githubJson(arguments_) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const output = execFileSync("gh", arguments_, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return JSON.parse(output);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          attempt * 500,
        );
      }
    }
  }
  throw lastError;
}

function sampleKey(candidate) {
  return sha256(
    Buffer.from(
      `${seed}:${candidate.repository.nameWithOwner}:${candidate.path}:${candidate.sha}`,
    ),
  );
}

function splitForRepository(repository) {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:${repository}`)
    .digest();
  return digest.readUInt32BE(0) % 3 === 0 ? "dev" : "eval";
}

function commitFromUrl(url) {
  const match = /\/blob\/([a-f0-9]{40})\//i.exec(url);
  if (!match) throw new Error(`Could not extract commit from ${url}`);
  return match[1];
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function annotationCsv(cases) {
  const header = [
    "case_id",
    "split",
    "stratum",
    "repository",
    "source_commit",
    "source_path",
    ...rules,
    "notes",
  ];
  const rows = cases.map((item) => [
    item.case_id,
    item.split,
    item.stratum,
    item.repository,
    item.source_commit,
    item.source_path,
    ...rules.map(() => ""),
    "",
  ]);
  return `${[header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function thirdPartyNotices(cases) {
  const lines = [
    "# Third-Party Workflow Snapshots",
    "",
    "Each snapshot remains attributable to its source repository and is included",
    "for reproducible research under the repository license recorded below.",
    "",
    "| Case | Repository | Commit | Path | License |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of cases) {
    lines.push(
      `| ${item.case_id} | [${item.repository}](${item.repository_url}) | [${item.source_commit.slice(0, 12)}](${item.source_url}) | \`${item.source_path}\` | ${item.license} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
