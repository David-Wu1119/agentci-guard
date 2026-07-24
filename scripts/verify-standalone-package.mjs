#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
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

  console.log(
    "Verified packed Action and CLI run from the extracted tarball without node_modules.",
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
