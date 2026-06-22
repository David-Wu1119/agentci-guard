import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { matchesPath, scanRepository, scanWorkflow } from "../src/index.js";
import type { WorkflowFile } from "../src/index.js";

const ROOT = "/repo";

function rulesFor(workflow: string): Set<string> {
  const file: WorkflowFile = {
    path: `${ROOT}/.github/workflows/test.yml`,
    raw: workflow,
    document: YAML.parse(workflow),
  };
  return new Set(scanWorkflow(file, ROOT).map((finding) => finding.rule_id));
}

describe("inline suppression", () => {
  const base = `
on: pull_request_target
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: \${{ github.event.pull_request.body }}
`;

  it("flags without a directive", () => {
    const rules = rulesFor(base);
    expect(rules.has("agentci/unpinned-ai-action")).toBe(true);
    expect(rules.has("agentci/pull-request-target-ai")).toBe(true);
  });

  it("# agentci-ignore <rule> suppresses just that rule", () => {
    const rules = rulesFor(
      `# agentci-ignore agentci/unpinned-ai-action -- pinned in a follow-up${base}`,
    );
    expect(rules.has("agentci/unpinned-ai-action")).toBe(false);
    expect(rules.has("agentci/pull-request-target-ai")).toBe(true);
  });

  it("# agentci-ignore-all silences the whole file", () => {
    const rules = rulesFor(`# agentci-ignore-all${base}`);
    expect(rules.size).toBe(0);
  });
});

describe("config-file suppression", () => {
  it("honors ignore (rule ids) and ignorePaths (globs)", async () => {
    const result = await scanRepository("tests/fixtures/suppress");
    const rules = new Set(result.findings.map((f) => f.rule_id));
    const files = new Set(result.findings.map((f) => f.file));

    // Both workflows are loaded...
    expect(result.workflow_count).toBe(2);
    // ...but noisy.yml is excluded by ignorePaths.
    expect([...files].some((f) => f.endsWith("noisy.yml"))).toBe(false);
    expect([...files].some((f) => f.endsWith("vuln.yml"))).toBe(true);
    // ...and the globally-ignored rule never appears.
    expect(rules.has("agentci/unpinned-ai-action")).toBe(false);
    expect(rules.has("agentci/pull-request-target-ai")).toBe(true);
  });
});

describe("matchesPath", () => {
  it("matches across and within segments", () => {
    expect(matchesPath("**/noisy.yml", ".github/workflows/noisy.yml")).toBe(
      true,
    );
    expect(matchesPath(".github/workflows/*.yml", ".github/workflows/ci.yml")).toBe(
      true,
    );
    expect(matchesPath("**/noisy.yml", ".github/workflows/vuln.yml")).toBe(
      false,
    );
  });
});
