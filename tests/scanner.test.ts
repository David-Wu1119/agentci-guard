import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  loadWorkflowFiles,
  parseWorkflowFile,
  scanRepository,
  scanWorkflow,
  scanWorkflowFiles,
  toSarif,
  type WorkflowFile,
} from "../src/index.js";

describe("scanRepository", () => {
  function scanIssueCommentPrompt(expression: string) {
    const raw = `on: issue_comment
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: codex exec "${expression}"
`;
    return scanWorkflowFiles(
      [parseWorkflowFile("/repo/.github/workflows/comment.yml", raw)],
      "/repo",
      { ignore: [], ignorePaths: [] },
    );
  }

  it("detects indexed GitHub comment fields as untrusted AI prompt input", () => {
    for (const field of [
      "github.event.comment.body",
      "github.event['comment'].body",
      "github.event['comment']['body']",
      "github['event'][ 'comment' ]['body']",
      "github.event ['comment'].body",
      "github.event['comment'] . body",
      "github . event . comment . body",
      "github.event[ 'comment' ] [ 'body' ]",
      "github . event ['comment'].body",
    ]) {
      const result = scanIssueCommentPrompt("${{ " + field + " }}");
      const rules = result.findings.map((finding) => finding.rule_id);

      expect(rules, field).toContain("agentci/untrusted-input-in-prompt");
      expect(rules, field).toContain("agentci/untrusted-ai-write-token");
      expect(result.analysis_complete, field).toBe(true);
    }
  });

  it("does not mistake a quoted expression literal for GitHub comment input", () => {
    const result = scanIssueCommentPrompt("${{ 'github.event.comment.body' }}");
    const rules = result.findings.map((finding) => finding.rule_id);

    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not match a longer context field by its untrusted prefix", () => {
    for (const field of [
      "github.event.comment.bodyguard",
      "github.event['comment']['bodyguard']",
    ]) {
      const result = scanIssueCommentPrompt("${{ " + field + " }}");
      const rules = result.findings.map((finding) => finding.rule_id);

      expect(rules, field).not.toContain("agentci/untrusted-input-in-prompt");
      expect(rules, field).not.toContain("agentci/untrusted-ai-write-token");
    }
  });

  it("does not treat a nested github property as the event context", () => {
    for (const field of [
      "inputs.github.event.comment.body",
      "inputs['github']['event']['comment']['body']",
    ]) {
      const result = scanIssueCommentPrompt("${{ " + field + " }}");
      const rules = result.findings.map((finding) => finding.rule_id);

      expect(rules, field).not.toContain("agentci/untrusted-input-in-prompt");
      expect(rules, field).not.toContain("agentci/untrusted-ai-write-token");
    }
  });

  it("loads direct regular workflow files in order, excluding file symlinks", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "agentci-workflows-"));
    try {
      expect(await loadWorkflowFiles(root)).toEqual([]);
      const directory = path.join(root, ".github/workflows");
      await fs.mkdir(path.join(directory, "nested"), { recursive: true });
      for (const name of ["b.yaml", "a.yml", ".hidden.yml"]) {
        await fs.writeFile(path.join(directory, name), "on: push\njobs: {}\n");
      }
      await fs.writeFile(
        path.join(directory, "nested", "skip.yml"),
        "on: push\njobs: {}\n",
      );
      await fs.symlink(
        path.join(directory, "a.yml"),
        path.join(directory, "link.yml"),
      );

      expect(
        (await loadWorkflowFiles(root)).map((workflow) =>
          path.basename(workflow.path),
        ),
      ).toEqual([".hidden.yml", "a.yml", "b.yaml"]);

      const aliasRoot = path.join(root, "alias");
      await fs.mkdir(path.join(aliasRoot, ".github"), { recursive: true });
      await fs.symlink(directory, path.join(aliasRoot, ".github", "workflows"));
      expect(
        (await loadWorkflowFiles(aliasRoot)).map((workflow) =>
          path.basename(workflow.path),
        ),
      ).toEqual([".hidden.yml", "a.yml", "b.yaml"]);

      const malformedRoot = path.join(root, "malformed");
      await fs.mkdir(path.join(malformedRoot, ".github"), { recursive: true });
      await fs.writeFile(path.join(malformedRoot, ".github/workflows"), "");
      await expect(loadWorkflowFiles(malformedRoot)).rejects.toMatchObject({
        code: "ENOTDIR",
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("detects unsafe AI-agent workflow patterns", async () => {
    const result = await scanRepository("tests/fixtures");
    const rules = new Set(result.findings.map((finding) => finding.rule_id));

    expect(result.workflow_count).toBe(2);
    expect(rules).toContain("agentci/pull-request-target-ai");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/ai-with-secrets");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/ai-shell-access");
    expect(rules).toContain("agentci/unsafe-checkout");
    expect(result.summary.critical).toBeGreaterThanOrEqual(2);
  });

  it("emits valid SARIF shape", async () => {
    const result = await scanRepository("tests/fixtures");
    const sarif = toSarif(result.findings);

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("AgentCI Guard");
    expect(sarif.runs[0]?.results.length).toBe(result.findings.length);
    for (const [index, entry] of (sarif.runs[0]?.results ?? []).entries()) {
      const finding = result.findings[index];
      expect(entry.locations[0]?.physicalLocation.region?.startLine).toBe(
        finding?.line,
      );
      expect(entry.properties["agentci/severity"]).toBe(finding?.severity);
      expect(entry.properties["agentci/reachableEvents"]).toEqual(
        finding?.reachable_events ?? [],
      );
      expect(entry.properties["agentci/stepIndex"]).toBe(finding?.step_index);
      expect(
        entry.locations[0]?.physicalLocation.region?.startLine ?? 0,
      ).toBeGreaterThan(1);
    }
  });

  it("locates the exact job and duplicate-name step by YAML structure", () => {
    const raw = `on: push
jobs:
  first:
    runs-on: ubuntu-latest
    env:
      target: decoy
    steps:
      - run: echo safe
  target:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Duplicate
        run: echo safe
      - name: Duplicate
        run: claude -p "review"
`;
    const workflow: WorkflowFile = {
      path: "/repo/.github/workflows/test.yml",
      raw,
      document: YAML.parse(raw),
    };
    const findings = scanWorkflow(workflow, "/repo");
    const jobFinding = findings.find(
      (finding) => finding.rule_id === "agentci/broad-write-permissions",
    );
    const stepFinding = findings.find(
      (finding) => finding.rule_id === "agentci/ai-shell-access",
    );
    const lines = raw.split("\n");
    expect(jobFinding?.line).toBe(
      lines.findIndex((line) => line === "  target:") + 1,
    );
    expect(stepFinding?.line).toBe(
      lines
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => line === "      - name: Duplicate")[1]?.number,
    );
  });

  it("shows the agent command when a long benign command precedes it", () => {
    const raw = `on: push
permissions:
  contents: read
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo ${"x".repeat(520)}
          codex exec hello
`;
    const workflow = parseWorkflowFile("/repo/.github/workflows/test.yml", raw);
    const result = scanWorkflowFiles([workflow], "/repo", {
      ignore: [],
      ignorePaths: [],
    });

    expect(result.agent_usages).toHaveLength(1);
    expect(result.agent_usages[0]?.evidence).toContain("codex exec hello");
  });

  it("identifies findings on unresolved event conditions as possible paths", () => {
    const raw = `on: [push, issue_comment]
permissions:
  contents: write
jobs:
  review:
    if: github.event_name == 'issue_comment' && github.repository == 'owner/repo'
    runs-on: ubuntu-latest
    steps:
      - if: steps.gate.outputs.ok
        run: codex exec hello
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.analysis_complete).toBe(false);
    expect(
      result.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code === "agentci/analysis-event-condition",
        )
        .map((diagnostic) => diagnostic.message),
    ).toEqual([
      "Could not fully interpret this job's if condition; unresolved branches retain possible event paths, so findings in this job may depend on those paths.",
      "Could not fully interpret this step's if condition; unresolved branches retain possible event paths, so findings at this step may depend on those paths.",
    ]);
  });

  it("fails when an explicit config path is missing", async () => {
    await expect(
      scanRepository("tests/fixtures", {
        configPath: "tests/fixtures/does-not-exist.json",
      }),
    ).rejects.toThrow("Unable to read config file");
  });

  it("rejects a missing scan path instead of reporting a clean repository", async () => {
    await expect(
      scanRepository("tests/fixtures/does-not-exist"),
    ).rejects.toThrow(
      "scan path is not a directory: tests/fixtures/does-not-exist",
    );
  });

  it("reports malformed YAML as a diagnostic, not a security finding", async () => {
    const result = await scanRepository("corpus/adversarial/cases/parse-error");

    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "agentci/parse-error",
        kind: "parse",
      }),
    ]);
    expect(result.analysis_complete).toBe(false);
  });
});
