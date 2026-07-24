#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const manifestPath = path.join(repositoryRoot, "benchmark", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const repositories = new Set();

for (const item of manifest.cases) {
  const snapshot = path.join(repositoryRoot, item.snapshot_path);
  if (!fs.existsSync(snapshot)) {
    errors.push(`${item.case_id}: missing ${item.snapshot_path}`);
    continue;
  }
  const content = fs.readFileSync(snapshot);
  const digest = crypto.createHash("sha256").update(content).digest("hex");
  if (digest !== item.sha256) {
    errors.push(
      `${item.case_id}: sha256 ${digest} does not match ${item.sha256}`,
    );
  }
  if (content.length !== item.bytes) {
    errors.push(
      `${item.case_id}: ${content.length} bytes does not match ${item.bytes}`,
    );
  }
  if (repositories.has(item.repository)) {
    errors.push(`${item.case_id}: repository is not unique`);
  }
  repositories.add(item.repository);
}

if (manifest.workflow_count !== manifest.cases.length) {
  errors.push("workflow_count does not match cases length");
}
if (manifest.repository_count !== repositories.size) {
  errors.push("repository_count does not match unique repositories");
}
if (manifest.workflow_count < 100 || manifest.repository_count < 50) {
  errors.push("benchmark minimum is 100 workflows from 50 repositories");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${manifest.workflow_count} immutable workflows from ${manifest.repository_count} repositories.`,
  );
}
