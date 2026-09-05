#!/usr/bin/env node
// Run `pnpm audit` as a gate that fails on vulnerabilities but tolerates a
// transiently unreachable advisory endpoint.
//
// `pnpm audit` exits 1 for two unrelated reasons: it found an advisory at or
// above the threshold, or it could not reach registry.npmjs.org's audit
// endpoint at all. A CI step that treats both the same way makes the
// pipeline's availability equal to the advisory endpoint's, and that endpoint
// has failed for minutes at a time while the rest of the registry stayed up.
//
// The two cases are distinguishable from the JSON output: a real result always
// carries `metadata`, while an unreachable endpoint yields `{ "error": … }`
// with no `metadata`. Only the second is retried. A sustained outage still
// fails the step after the retry window; nothing here skips the audit.
//
// Usage: node scripts/audit-dependencies.mjs [--level high] [--attempts 8] [--wait 45]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Only run when executed directly, so decide() can be imported and tested.
const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSafe(process.argv[1])).href;

function realpathSafe(file) {
  const resolved = path.resolve(file);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ""), process.argv[index + 1]);
}
const level = args.get("level") ?? "high";
const attempts = Number(args.get("attempts") ?? 8);
const waitSeconds = Number(args.get("wait") ?? 45);
const perAttemptMs = Number(args.get("timeout") ?? 90) * 1000;

const sleep = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function runAudit() {
  const result = spawnSync(
    "pnpm",
    ["audit", `--audit-level=${level}`, "--json"],
    { encoding: "utf8", timeout: perAttemptMs, env: process.env },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  return { status: result.status, parsed, stderr: result.stderr ?? "" };
}

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

/**
 * Decide from the parsed JSON alone. pnpm's exit code cannot be trusted in
 * --json mode: it exits 1 whenever any advisory exists, even one below the
 * requested level, so a lockfile with a single known low would fail a high
 * gate. Counts in metadata.vulnerabilities are authoritative.
 */
export function decide(parsed, threshold) {
  if (
    parsed === null ||
    parsed === undefined ||
    parsed.metadata === undefined
  ) {
    return "unreachable";
  }
  const counts = parsed.metadata.vulnerabilities ?? {};
  const floor = SEVERITY_ORDER.indexOf(threshold);
  const above = SEVERITY_ORDER.slice(floor).some(
    (severity) => (counts[severity] ?? 0) > 0,
  );
  return above ? "vulnerable" : "clean";
}

function summarize(parsed) {
  const counts = parsed?.metadata?.vulnerabilities ?? {};
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${severity}=${count}`)
    .join(" ");
}

if (invokedAsScript) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { parsed, stderr } = runAudit();
    const verdict = decide(parsed, level);

    if (verdict === "clean") {
      console.log(
        `audit clean at level ${level} (attempt ${attempt}): ${summarize(parsed) || "no advisories"}`,
      );
      process.exit(0);
    }

    if (verdict === "vulnerable") {
      // The endpoint answered and the answer is "vulnerable". Fail immediately;
      // retrying would only repeat it. Re-run without --json so the readable
      // table lands in the log; that re-run is best-effort.
      console.error(
        `::error::pnpm audit found advisories at or above ${level}: ${summarize(parsed)}`,
      );
      spawnSync("pnpm", ["audit", `--audit-level=${level}`], {
        stdio: "inherit",
        timeout: perAttemptMs,
      });
      process.exit(1);
    }

    const reason =
      parsed?.error?.summary ??
      parsed?.error?.message ??
      stderr.trim().split("\n").filter(Boolean).at(-1) ??
      "no response";
    console.log(
      `advisory endpoint unreachable (attempt ${attempt}/${attempts}): ${reason}`,
    );
    if (attempt < attempts) await sleep(waitSeconds);
  }

  console.error(
    `::error::advisory endpoint unreachable after ${attempts} attempts; the audit could not run. Not treating this as clean.`,
  );
  process.exit(1);
}
