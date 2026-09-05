import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepository } from "../src/index.js";

// A local reusable workflow cannot exceed the permissions its caller grants.
// GitHub intersects the two, so the analyzer must as well: a callee that asks
// for `contents: write` under a caller that grants `contents: read` runs with
// read, and must not be reported as holding a write token.
async function repository(
  callerPermissions: string,
  calleePermissions: string,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-reusable-"));
  const workflows = path.join(root, ".github", "workflows");
  await fs.mkdir(workflows, { recursive: true });
  await fs.writeFile(
    path.join(workflows, "caller.yml"),
    `
on:
  issues:
    types: [opened]
${callerPermissions}
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    secrets: inherit
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(workflows, "agent.yml"),
    `
on:
  workflow_call:
jobs:
  agent:
    runs-on: ubuntu-latest
${calleePermissions}
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: "Triage: \${{ github.event.issue.title }}"
`,
    "utf8",
  );
  return root;
}

const ruleIds = async (root: string) =>
  new Set((await scanRepository(root)).findings.map((f) => f.rule_id));

describe("reusable-workflow permission ceiling", () => {
  it("lowers a callee write request to the caller's read grant", async () => {
    const root = await repository(
      "permissions:\n  contents: read\n  issues: read",
      "    permissions:\n      contents: write\n      issues: write",
    );
    const rules = await ruleIds(root);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/broad-write-permissions");
    // The agent still sees untrusted content; only the write half is gone.
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("keeps write when both caller and callee grant it", async () => {
    const root = await repository(
      "permissions:\n  contents: write\n  issues: write",
      "    permissions:\n      contents: write\n      issues: write",
    );
    // Write survives the ceiling; the callee is bare claude-code-action so the
    // write-token finding is the gated (high) variant.
    expect(await ruleIds(root)).toContain("agentci/gated-ai-write-token");
  });

  it("treats a caller grant of none as none regardless of the callee", async () => {
    const root = await repository(
      "permissions: {}",
      "    permissions:\n      contents: write\n      issues: write",
    );
    const rules = await ruleIds(root);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/broad-write-permissions");
  });

  it("keeps the result unknown when the caller never declared permissions", async () => {
    // With no caller grant and no configured default, GitHub's repository
    // setting decides, so the analyzer must not claim either read or write.
    const root = await repository(
      "",
      "    permissions:\n      contents: write\n      issues: write",
    );
    const result = await scanRepository(root);
    expect(result.analysis_complete).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.code === "agentci/analysis-permissions-unknown",
      ),
    ).toBe(true);
  });
});
