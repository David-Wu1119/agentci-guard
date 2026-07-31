#!/usr/bin/env node
import fs from "node:fs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error(
    "Usage: node scripts/verify-package.mjs <npm-pack-dry-run.json>",
  );
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch (error) {
  console.error(
    `${reportPath}: unable to parse npm pack report: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

const entry = report?.[0];
const files = new Set((entry?.files ?? []).map((file) => file.path));
const required = [
  "action.yml",
  "dist/action.js",
  "dist/cli.js",
  "dist/index.js",
  "README.md",
  "RULES.md",
  "THREAT_MODEL.md",
  "REPRODUCIBILITY.md",
  "THIRD_PARTY_LICENSES.md",
];
const missing = required.filter((file) => !files.has(file));
const errors = [];

if (entry?.name !== "agentci-guard") {
  errors.push(`unexpected package name ${String(entry?.name)}`);
}
if (entry?.version !== "0.1.1") {
  errors.push(`unexpected package version ${String(entry?.version)}`);
}
if (missing.length > 0) {
  errors.push(`package is missing required files: ${missing.join(", ")}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified package contents (${files.size} files).`);
}
