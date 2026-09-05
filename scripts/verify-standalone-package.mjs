#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Usage: node scripts/verify-standalone-package.mjs [--record <file.json>]
// --record writes the packed artifact's identity (filename, SHA-256, version,
// source commit) and every check performed, so a reviewer can tie a tarball to
// the commit and behavior it was verified against.
const recordPath = (() => {
  const index = process.argv.indexOf("--record");
  return index === -1 ? undefined : process.argv[index + 1];
})();
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  if (!ok)
    throw new Error(
      `Packed artifact check failed: ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
    );
};

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentci-package-smoke-"),
);

try {
  const packReport = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--foreground-scripts=false",
        "--pack-destination",
        temporary,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      },
    ),
  );
  const filename = packReport?.[0]?.filename;
  if (typeof filename !== "string" || !filename.endsWith(".tgz")) {
    throw new Error("npm pack did not report a tarball filename.");
  }
  execFileSync(
    "tar",
    ["-xzf", path.join(temporary, filename), "-C", temporary],
    { stdio: "pipe" },
  );

  const packageRoot = path.join(temporary, "package");
  if (fs.existsSync(path.join(packageRoot, "node_modules"))) {
    throw new Error("Published tarball unexpectedly contains node_modules.");
  }
  const tarballPath = path.join(temporary, filename);
  const tarballSha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(tarballPath))
    .digest("hex");
  const packedVersion = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  ).version;
  const reportedVersion = execFileSync(
    process.execPath,
    ["dist/cli.js", "--version"],
    { cwd: packageRoot, encoding: "utf8" },
  ).trim();
  check(
    "packed CLI reports the packed package.json version",
    reportedVersion === packedVersion,
    { packed: packedVersion, reported: reportedVersion },
  );

  const sarifPath = path.join(temporary, "action.sarif");
  const outputPath = path.join(temporary, "github-output");
  const action = spawnSync(process.execPath, ["dist/action.js"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      INPUT_PATH: "examples/vulnerable",
      INPUT_SARIF: sarifPath,
      "INPUT_FAIL-ON": "none",
      GITHUB_OUTPUT: outputPath,
    },
  });
  if (action.status !== 0) {
    throw new Error(
      `Packed Action failed without node_modules (exit ${String(action.status)}):\n${action.stderr || action.stdout}`,
    );
  }
  const sarif = JSON.parse(fs.readFileSync(sarifPath, "utf8"));
  if (sarif?.runs?.[0]?.results?.length !== 9) {
    throw new Error("Packed Action did not emit the 9-fixture SARIF baseline.");
  }
  if (!fs.readFileSync(outputPath, "utf8").includes("analysis-complete=true")) {
    throw new Error("Packed Action did not emit complete GitHub outputs.");
  }

  const cliOutput = execFileSync(
    process.execPath,
    ["dist/cli.js", "scan", "examples/hardened", "--json", "--fail-on", "none"],
    { cwd: packageRoot, encoding: "utf8" },
  );
  const cliResult = JSON.parse(cliOutput);
  if (
    cliResult.workflow_count !== 1 ||
    cliResult.findings.length !== 0 ||
    cliResult.analysis_complete !== true
  ) {
    throw new Error("Packed CLI hardened smoke returned an unexpected result.");
  }

  check(
    "packed Action: examples/vulnerable emits the 9-finding SARIF baseline, analysis complete",
    true,
  );
  check(
    "packed CLI: examples/hardened has 0 findings, analysis complete",
    true,
  );

  // Fixtures written outside the checkout, so the packed scanner is judged on
  // inputs it has never seen in this repository's examples.
  const fixture = (name, files) => {
    const root = path.join(temporary, "fixtures", name);
    const workflows = path.join(root, ".github", "workflows");
    fs.mkdirSync(workflows, { recursive: true });
    for (const [file, raw] of Object.entries(files)) {
      fs.writeFileSync(path.join(workflows, file), raw, "utf8");
    }
    return root;
  };
  const cliJson = (root) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["dist/cli.js", "scan", root, "--json", "--fail-on", "none"],
        { cwd: packageRoot, encoding: "utf8" },
      ),
    );
  const rules = (result) => result.findings.map((f) => f.rule_id);

  // Day 2 (v0.5.0): a recognized actor gate on the agent step itself is a gate.
  const gatedStep = `
on: pull_request_target
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        if: github.actor == github.repository_owner
        with:
          prompt: Review this pull request
`;
  const gated = cliJson(fixture("prt-step-gated", { "review.yml": gatedStep }));
  // The gate condition also trips the documented `analysis-event-condition`
  // diagnostic (docs/analysis-model.md: any condition outside the interpretable
  // event subset is kept conservative and reported), so the scan is marked
  // incomplete. That is the frozen v0.5.0 contract, recorded as a known problem
  // in evidence/sprint-2026-09-05/day4/; only the finding set is asserted here.
  check(
    "packed CLI: step-level actor gate suppresses pull-request-target-ai",
    !rules(gated).includes("agentci/pull-request-target-ai"),
    rules(gated),
  );
  const unguarded = cliJson(
    fixture("prt-unguarded", {
      "review.yml": gatedStep.replace(
        "        if: github.actor == github.repository_owner\n",
        "",
      ),
    }),
  );
  check(
    "packed CLI: the same workflow without the gate is critical",
    rules(unguarded).includes("agentci/pull-request-target-ai"),
    rules(unguarded),
  );

  // Day 3 (v0.5.0): an incomplete zero-finding scan is visible in text, SARIF,
  // and the Action's outputs and log.
  const incompleteRoot = fixture("incomplete", {
    "delegated.yml":
      "on: push\njobs:\n  delegated:\n    uses: example/shared/.github/workflows/ci.yml@v1\n",
  });
  const incompleteSarif = path.join(temporary, "incomplete.sarif");
  const incompleteText = execFileSync(
    process.execPath,
    [
      "dist/cli.js",
      "scan",
      incompleteRoot,
      "--sarif",
      incompleteSarif,
      "--fail-on",
      "none",
    ],
    { cwd: packageRoot, encoding: "utf8" },
  );
  check(
    "packed CLI: text report says the analysis is incomplete",
    /Analysis: incomplete \(1 diagnostic\(s\)\)/.test(incompleteText),
  );
  const incompleteRun = JSON.parse(fs.readFileSync(incompleteSarif, "utf8"))
    .runs[0];
  check(
    "packed CLI: SARIF invocation reports executionSuccessful=false with one notification",
    incompleteRun.results.length === 0 &&
      incompleteRun.invocations?.[0]?.executionSuccessful === false &&
      incompleteRun.invocations[0].toolExecutionNotifications.length === 1 &&
      incompleteRun.invocations[0].toolExecutionNotifications[0].descriptor
        .id === "agentci/analysis-remote-reusable-workflow",
  );
  const incompleteOutput = path.join(temporary, "incomplete-output");
  const incompleteSummary = path.join(temporary, "incomplete-summary.md");
  fs.writeFileSync(incompleteSummary, "", "utf8");
  const incompleteAction = spawnSync(process.execPath, ["dist/action.js"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      INPUT_PATH: incompleteRoot,
      INPUT_SARIF: path.join(temporary, "incomplete-action.sarif"),
      "INPUT_FAIL-ON": "none",
      GITHUB_OUTPUT: incompleteOutput,
      GITHUB_STEP_SUMMARY: incompleteSummary,
    },
  });
  check(
    "packed Action: incomplete analysis exits 0 at fail-on none, sets analysis-complete=false, prints ::warning::, writes step summary",
    incompleteAction.status === 0 &&
      fs
        .readFileSync(incompleteOutput, "utf8")
        .includes("analysis-complete=false") &&
      /::warning::AgentCI Guard analysis incomplete/.test(
        incompleteAction.stdout,
      ) &&
      /incomplete/.test(fs.readFileSync(incompleteSummary, "utf8")),
    { exit: incompleteAction.status },
  );

  if (recordPath) {
    const git = (args) =>
      execFileSync("git", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim();
    const record = {
      verified_at: new Date().toISOString(),
      tarball: filename,
      sha256: tarballSha256,
      bytes: fs.statSync(tarballPath).size,
      packed_version: packedVersion,
      source_commit: git(["rev-parse", "HEAD"]),
      working_tree_changes: git(["status", "--porcelain"])
        .split("\n")
        .filter(Boolean).length,
      node: process.version,
      checks,
    };
    fs.mkdirSync(path.dirname(path.resolve(recordPath)), { recursive: true });
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
    // Keep the verified tarball beside the record so the hash can be re-checked.
    fs.copyFileSync(
      tarballPath,
      path.join(path.dirname(path.resolve(recordPath)), filename),
    );
  }

  console.log(
    `Verified packed Action and CLI run from the extracted tarball without node_modules (${filename}, sha256 ${tarballSha256.slice(0, 12)}…, ${checks.length} checks).`,
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
