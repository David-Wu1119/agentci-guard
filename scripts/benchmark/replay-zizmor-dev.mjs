#!/usr/bin/env node
// Preserve a third-party scanner's raw development-fixture output, not accuracy.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const corpus = path.join(root, "corpus/adversarial");
const casesRoot = realpathSync(path.join(corpus, "cases"));
const flags = [
  "--offline",
  "--no-config",
  "--collect",
  "workflows",
  "--strict-collection",
  "--persona",
  "regular",
  "--format",
  "json",
  "--no-progress",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function outcome(result) {
  let findings;
  try {
    findings = JSON.parse(result.stdout);
  } catch {
    return "tool-error";
  }
  return !result.error &&
    result.signal === null &&
    Number.isInteger(result.status) &&
    Array.isArray(findings) &&
    findings.every((finding) => finding && typeof finding === "object") &&
    // shortcut: observed 1.30.0 finding exits are 10+; review on version change.
    (result.status === 0 || (result.status >= 10 && findings.length > 0))
    ? "audit-json"
    : "tool-error";
}

function executable() {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, "zizmor");
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Try the next installed executable; never download one.
    }
  }
  throw new Error("zizmor is not installed on PATH");
}

function withinCases(directory) {
  return realpathSync(directory).startsWith(`${casesRoot}${path.sep}`);
}

function replay(destination) {
  const binary = executable();
  const version = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (version.status !== 0 || !version.stdout.trim()) {
    throw new Error(`Could not identify installed zizmor: ${version.stderr}`);
  }
  const manifestBytes = readFileSync(path.join(corpus, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema_version !== 2 || !Array.isArray(manifest.cases)) {
    throw new Error("Unexpected adversarial corpus manifest version");
  }
  const out = path.resolve(destination);
  mkdirSync(out); // Refuse an existing directory rather than overwriting a replay.
  const records = [];
  for (const fixture of [...manifest.cases].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(fixture.id)) {
      throw new Error(`Unsafe fixture ID: ${fixture.id}`);
    }
    const workflowDir = path.resolve(corpus, fixture.path, ".github/workflows");
    if (!withinCases(workflowDir)) {
      throw new Error(`Fixture escapes corpus: ${fixture.id}`);
    }
    const workflows = readdirSync(workflowDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (!workflows.length) throw new Error(`No workflow: ${fixture.id}`);
    const caseOut = path.join(out, "cases", fixture.id);
    mkdirSync(caseOut, { recursive: true });
    for (const name of workflows) {
      const input = path.join(workflowDir, name);
      const relativeInput = path.relative(root, input);
      const result = spawnSync(binary, [...flags, relativeInput], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      const classification = outcome(result);
      const output = path.join(
        "cases",
        fixture.id,
        `${name}.stdout.${classification === "audit-json" ? "json" : "txt"}`,
      );
      const stderr = path.join("cases", fixture.id, `${name}.stderr.txt`);
      writeFileSync(path.join(out, output), result.stdout ?? "", {
        flag: "wx",
      });
      writeFileSync(path.join(out, stderr), result.stderr ?? "", {
        flag: "wx",
      });
      records.push({
        case_id: fixture.id,
        input: relativeInput,
        input_sha256: sha256(readFileSync(input)),
        stdout: output,
        stdout_sha256: sha256(result.stdout ?? ""),
        stderr,
        stderr_sha256: sha256(result.stderr ?? ""),
        exit_status: result.status,
        signal: result.signal,
        outcome: classification,
        expected_invalid_input: fixture.expected.diagnostics.some(
          (item) => item.code === "agentci/parse-error",
        ),
      });
    }
  }
  writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        purpose:
          "Development-only raw baseline replay; no accuracy or superiority claim.",
        comparability:
          "Zizmor audits and AgentCI rules are not presumed equivalent; do not compare raw alert counts.",
        generated_at: new Date().toISOString(),
        corpus_manifest_sha256: sha256(manifestBytes),
        tool: {
          name: "zizmor",
          version: version.stdout.trim(),
          executable: binary,
          executable_sha256: sha256(readFileSync(binary)),
          flags,
        },
        records,
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  const errors = records.filter(
    (record) =>
      record.outcome === "tool-error" && !record.expected_invalid_input,
  );
  console.log(
    `Preserved ${records.length} raw workflow outputs in ${out}; ${errors.length} unexpected tool errors. No accuracy estimate.`,
  );
  if (errors.length) process.exitCode = 1;
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--self-test") {
  const first = JSON.parse(readFileSync(path.join(corpus, "manifest.json")))
    .cases[0];
  assert.equal(
    withinCases(path.join(corpus, first.path, ".github/workflows")),
    true,
  );
  assert.equal(withinCases(corpus), false);
  assert.equal(
    outcome({ stdout: '[{"ident":"finding"}]', status: 14, signal: null }),
    "audit-json",
  );
  assert.equal(
    outcome({ stdout: "fatal: no audit", status: 3, signal: null }),
    "tool-error",
  );
  assert.equal(
    outcome({ stdout: '[{"ident":"partial"}]', status: 1, signal: null }),
    "tool-error",
  );
  assert.equal(
    outcome({ stdout: "[]", status: 0, signal: null }),
    "audit-json",
  );
  console.log("zizmor replay classification smoke passed");
} else if (args.length === 2 && args[0] === "--out" && args[1]) {
  replay(args[1]);
} else {
  throw new Error(
    "Usage: replay-zizmor-dev.mjs --out NEW_DIRECTORY | --self-test",
  );
}
