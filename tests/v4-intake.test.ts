import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const verifier = path.join(root, "scripts/benchmark/verify-v4-intake.mjs");
const temporaryRoots: string[] = [];
const scopes = {
  "agentci/agent-usage": "step",
  "agentci/untrusted-ai-write-token": "job",
  "agentci/gated-ai-write-token": "job",
  "agentci/pull-request-target-ai": "job",
  "agentci/ai-with-secrets": "job",
  "agentci/untrusted-input-in-prompt": "step",
  "agentci/ai-shell-access": "step",
  "agentci/broad-write-permissions": "job",
  "agentci/unpinned-ai-action": "step",
  "agentci/unsafe-checkout": "step",
};

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("future v4 intake", () => {
  it("accepts only pinned synthetic bytes without scanning them", () => {
    const fixture = createFixture();
    const result = verify(fixture.file);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Verified 1 unlabeled v4 intake cases");
    expect(result.stdout).not.toContain("synthetic workflow content");
  });

  it("rejects wrong status, task registry, and scanner pins", () => {
    const fixture = createFixture();
    fixture.manifest.status = "evaluated";
    expectFailure(fixture, /unlabeled status/);
    fixture.manifest.status = "unlabeled";
    fixture.manifest.rules.pop();
    expectFailure(fixture, /nine-rule registry/);
    fixture.manifest.rules = Object.keys(scopes).filter(
      (rule) => rule !== "agentci/agent-usage",
    );
    fixture.manifest.scanner_bundle_sha256 = "0".repeat(64);
    expectFailure(fixture, /scanner source or bundle/);
  });

  it("rejects a correctly pinned historical eight-rule scanner", () => {
    const fixture = createFixture();
    const commit = git("rev-parse", "v0.1.1^{commit}").toString("utf8").trim();
    fixture.manifest.scanner_commit = commit;
    fixture.manifest.scanner_source_tree = git("rev-parse", `${commit}:src`)
      .toString("utf8")
      .trim();
    fixture.manifest.scanner_bundle_sha256 = sha256(
      git("show", `${commit}:dist/index.js`),
    );
    expectFailure(fixture, /Pinned scanner rule registry/);
  });

  it("rejects tampered source and protocol files", () => {
    const fixture = createFixture();
    fs.appendFileSync(fixture.snapshot, "# tampered\n");
    expectFailure(fixture, /snapshot bytes/);
    fs.writeFileSync(fixture.snapshot, fixture.workflow);
    fs.appendFileSync(path.join(fixture.directory, "CONTRACT.md"), "changed\n");
    expectFailure(fixture, /protocol_path differs/);
  });

  it("rejects path traversal and symlinked snapshots", () => {
    const fixture = createFixture();
    fixture.manifest.protocol_path = "../CONTRACT.md";
    expectFailure(fixture, /inside its manifest directory/);
    fixture.manifest.protocol_path = "CONTRACT.md";
    fs.unlinkSync(fixture.snapshot);
    fs.symlinkSync(
      path.join(fixture.directory, "CONTRACT.md"),
      fixture.snapshot,
    );
    expectFailure(fixture, /must not use symlinks/);
  });

  it("rejects overlap with archived development repositories", () => {
    const fixture = createFixture();
    const archived = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          "benchmark/archive/agentci-real-workflows-v1/manifest.json",
        ),
        "utf8",
      ),
    );
    const repository = archived.cases[0].repository;
    fixture.manifest.cases[0].repository = repository.toUpperCase();
    fixture.manifest.cases[0].repository_url = `https://github.com/${repository.toUpperCase()}`;
    fixture.manifest.cases[0].source_url = `https://github.com/${repository.toUpperCase()}/blob/${fixture.manifest.cases[0].source_commit}/${fixture.manifest.cases[0].source_path}`;
    expectFailure(fixture, /overlaps development/);
  });

  it("rejects duplicate repositories and malformed case paths", () => {
    const fixture = createFixture();
    fixture.manifest.cases.push({
      ...fixture.manifest.cases[0],
      case_id: "synthetic-002",
    });
    fixture.manifest.workflow_count = 2;
    fixture.manifest.repository_count = 2;
    expectFailure(fixture, /another v4 case/);
    fixture.manifest.cases.pop();
    fixture.manifest.workflow_count = 1;
    fixture.manifest.repository_count = 1;
    fixture.manifest.cases[0].snapshot_path = "../outside.yml";
    expectFailure(fixture, /snapshot path/);
  });

  it("rejects labels or predictions at intake", () => {
    const fixture = createFixture();
    const caseRecord = fixture.manifest.cases[0] as Record<string, unknown>;
    caseRecord.ground_truth = "negative";
    expectFailure(fixture, /unexpected fields/);
    delete caseRecord.ground_truth;
    fs.mkdirSync(path.join(fixture.directory, "labels"));
    expectFailure(fixture, /Intake must precede labels/);
  });
});

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentci-v4-synthetic-"),
  );
  temporaryRoots.push(directory);
  const workflow = Buffer.from(
    "# synthetic workflow content\non: workflow_dispatch\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
  );
  const sourcePath = ".github/workflows/synthetic.yml";
  const caseId = "synthetic-001";
  const snapshotPath = `snapshots/${caseId}/${sourcePath}`;
  const snapshot = path.join(directory, snapshotPath);
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  fs.writeFileSync(snapshot, workflow);
  const protocol = Buffer.from("Synthetic human contract only.\n");
  const samplingPlan = Buffer.from("Synthetic sampling plan only.\n");
  fs.writeFileSync(path.join(directory, "CONTRACT.md"), protocol);
  fs.writeFileSync(path.join(directory, "SAMPLING.md"), samplingPlan);
  const commit = git("rev-parse", "HEAD").toString("utf8").trim();
  const repository = "synthetic/example";
  const manifest = {
    schema_version: 1,
    benchmark_id: "agentci-real-workflows-v4",
    status: "unlabeled",
    frozen_at: new Date().toISOString(),
    workflow_count: 1,
    repository_count: 1,
    scanner_commit: commit,
    scanner_source_tree: git("rev-parse", `${commit}:src`)
      .toString("utf8")
      .trim(),
    scanner_bundle_sha256: sha256(git("show", `${commit}:dist/index.js`)),
    protocol_path: "CONTRACT.md",
    protocol_sha256: sha256(protocol),
    sampling_plan_path: "SAMPLING.md",
    sampling_plan_sha256: sha256(samplingPlan),
    agent_detection_task: "agentci/agent-usage",
    rules: Object.keys(scopes).filter((rule) => rule !== "agentci/agent-usage"),
    task_granularity: scopes,
    cases: [
      {
        case_id: caseId,
        split: "eval",
        stratum: "synthetic",
        repository,
        repository_url: `https://github.com/${repository}`,
        source_path: sourcePath,
        source_url: `https://github.com/${repository}/blob/${commit}/${sourcePath}`,
        source_commit: commit,
        blob_sha: crypto
          .createHash("sha1")
          .update(`blob ${workflow.length}\0`)
          .update(workflow)
          .digest("hex"),
        sha256: sha256(workflow),
        bytes: workflow.length,
        license: "MIT",
        snapshot_path: snapshotPath,
      },
    ],
  };
  const file = path.join(directory, "manifest.json");
  fs.writeFileSync(file, `${JSON.stringify(manifest)}\n`);
  return {
    directory,
    file,
    manifest,
    snapshot,
    workflow,
  };
}

function expectFailure(
  fixture: ReturnType<typeof createFixture>,
  reason: RegExp,
) {
  fs.writeFileSync(fixture.file, `${JSON.stringify(fixture.manifest)}\n`);
  const result = verify(fixture.file);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(reason);
}

function verify(file: string) {
  return spawnSync(process.execPath, [verifier, file], {
    cwd: root,
    encoding: "utf8",
  });
}

function git(...arguments_: string[]) {
  return execFileSync("git", arguments_, { cwd: root });
}

function sha256(value: Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
