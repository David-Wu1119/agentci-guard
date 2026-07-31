#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const baselineRoot = path.join(repositoryRoot, "studies", "v0.1.0-baseline");
const environment = JSON.parse(
  fs.readFileSync(path.join(baselineRoot, "environment.json"), "utf8"),
);
const expectedResults = JSON.parse(
  fs.readFileSync(path.join(baselineRoot, "expected-results.json"), "utf8"),
);
const checksums = fs
  .readFileSync(path.join(baselineRoot, "checksums.txt"), "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid baseline checksum row: ${line}`);
    return { sha256: match[1], file: match[2] };
  });

const baselineCommit = git([
  "rev-parse",
  `${environment.working_tree_commit}^{commit}`,
]);
if (baselineCommit !== environment.working_tree_commit) {
  throw new Error(
    `Recorded baseline commit resolved to ${baselineCommit}; expected ${environment.working_tree_commit}.`,
  );
}
const releaseCommit = git(["rev-parse", "v0.1.0^{}"]);
if (releaseCommit !== environment.published_v0_1_0_commit) {
  throw new Error(
    `v0.1.0 resolves to ${releaseCommit}; expected ${environment.published_v0_1_0_commit}.`,
  );
}
if (expectedResults.baseline_commit !== baselineCommit) {
  throw new Error("Baseline output record names a different scanner commit.");
}

for (const item of checksums) {
  const content = execFileSync(
    "git",
    ["show", `${baselineCommit}:${item.file}`],
    {
      cwd: repositoryRoot,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const digest = crypto.createHash("sha256").update(content).digest("hex");
  if (digest !== item.sha256) {
    throw new Error(
      `${item.file} at ${baselineCommit} has SHA-256 ${digest}; expected ${item.sha256}.`,
    );
  }
}

const vulnerableCount = Object.values(
  expectedResults.vulnerable.summary,
).reduce((sum, count) => sum + count, 0);
if (
  expectedResults.schema_version !== 1 ||
  expectedResults.vulnerable.workflow_count !== 1 ||
  expectedResults.hardened.workflow_count !== 1 ||
  vulnerableCount !== expectedResults.vulnerable.findings.length ||
  expectedResults.hardened.findings.length !== 0 ||
  Object.values(expectedResults.hardened.summary).some((count) => count !== 0)
) {
  throw new Error("Frozen v0.1.0 fixture output record is internally invalid.");
}

console.log(
  `Verified v0.1.0 tag ${releaseCommit.slice(0, 12)}, baseline commit ${baselineCommit.slice(0, 12)}, ${checksums.length} historical file checksums, and frozen fixture summaries.`,
);

function git(arguments_) {
  try {
    return execFileSync("git", arguments_, {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(
      "Historical Git objects or tags are unavailable. Fetch full history and tags before verifying the baseline.",
    );
  }
}
