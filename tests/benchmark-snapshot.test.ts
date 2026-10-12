import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

it("rejects a source URL for a different repository", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentci-benchmark-source-url-"),
  );
  try {
    const benchmarkRoot = path.join(temporary, "benchmark");
    const scriptRoot = path.join(temporary, "scripts/benchmark");
    fs.mkdirSync(benchmarkRoot);
    fs.mkdirSync(scriptRoot, { recursive: true });
    fs.copyFileSync(
      path.join(repositoryRoot, "scripts/benchmark/verify-snapshot.mjs"),
      path.join(scriptRoot, "verify-snapshot.mjs"),
    );
    for (const name of ["THIRD_PARTY_NOTICES.md", "archive", "snapshots"]) {
      fs.symlinkSync(
        path.join(repositoryRoot, "benchmark", name),
        path.join(benchmarkRoot, name),
      );
    }
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, "benchmark/manifest.json"),
        "utf8",
      ),
    );
    const first = manifest.cases[0];
    first.source_url = first.source_url.replace(
      `github.com/${first.repository}/`,
      "github.com/other/repo/",
    );
    fs.writeFileSync(
      path.join(benchmarkRoot, "manifest.json"),
      JSON.stringify(manifest),
    );
    const result = spawnSync(
      process.execPath,
      [path.join(scriptRoot, "verify-snapshot.mjs")],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `${first.case_id}: source URL does not match repository, commit, and workflow path`,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
