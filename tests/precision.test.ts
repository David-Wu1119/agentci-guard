import { describe, expect, it } from "vitest";
import {
  containsShellAccess,
  looksLikeAiAction,
  looksLikeAiCli,
} from "../src/detect.js";
import { scanRepository } from "../src/index.js";

describe("precision", () => {
  it("requires a load-bearing Action or executable CLI signal", () => {
    expect(looksLikeAiAction("openai/codex-action@v1")).toBe(true);
    expect(looksLikeAiCli("claude --print 'review this patch'")).toBe(true);
    expect(
      looksLikeAiCli("REVIEW=$(cursor-agent --print 'review this patch')"),
    ).toBe(true);
    expect(looksLikeAiCli("uvx aider --message 'fix the test'")).toBe(true);
    expect(looksLikeAiCli("codex exec 'review this patch'")).toBe(true);
  });

  it("rejects provider context, lookalikes, and nonexecuting CLI checks", () => {
    expect(looksLikeAiAction("datadog/agent-action@v1")).toBe(false);
    expect(looksLikeAiCli("aider_version=$(aider --version)")).toBe(false);
    expect(looksLikeAiCli("cursor-agent --help")).toBe(false);
    expect(looksLikeAiCli("pip install aider-chat")).toBe(false);
    expect(
      looksLikeAiCli(
        'curl https://api.openai.com/v1/responses -d \'{"model":"gpt-4o"}\'',
      ),
    ).toBe(false);
  });

  it("requires structured Action input evidence for shell capability", () => {
    expect(containsShellAccess({ allowed_tools: "Bash(git:*)" })).toBe(true);
    expect(
      containsShellAccess({ claude_args: "--allowedTools Shell(git:*)" }),
    ).toBe(true);
    expect(containsShellAccess({ enable_shell: true })).toBe(true);
    expect(containsShellAccess({ enable_shell: false })).toBe(false);
    expect(
      containsShellAccess({ prompt: "Do not enable shell or commands." }),
    ).toBe(false);
  });

  it("produces zero findings on ordinary CI (no AI agent present)", async () => {
    const result = await scanRepository("tests/fixtures/benign");

    expect(result.workflow_count).toBeGreaterThanOrEqual(3);
    // A self-hosted "build-agent" runner, a "datadog/agent-action", and a
    // "User-Agent" header must NOT be mistaken for AI-agent usage.
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("still detects real agent usage in the known-vulnerable fixture", async () => {
    const result = await scanRepository("tests/fixtures");
    const rules = new Set(result.findings.map((finding) => finding.rule_id));

    expect(result.agent_usages.length).toBeGreaterThan(0);
    expect(
      result.agent_usages.every(
        (usage) =>
          Number.isInteger(usage.step_index) &&
          usage.line > 1 &&
          usage.reachable_events.length > 0,
      ),
    ).toBe(true);
    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(true);
    expect(rules.has("agentci/pull-request-target-ai")).toBe(true);
    expect(rules.has("agentci/ai-with-secrets")).toBe(true);
  });
});

// The action matcher names owners exactly. A `uses:` reference starts with its
// owner, and every pattern must match there; `\b` alone accepted any owner
// ending in the vendor's name after a hyphen (found by the 2026-09-09 review).
describe("action owner identity is exact", () => {
  it("rejects prefixed owners for every vendor", () => {
    for (const prefixed of [
      "fake-openai/codex-action@v1",
      "not-anthropics/claude-code-action@v1",
      "evil-sweepai/sweep@v1",
      "not-google-github-actions/run-gemini-cli@v0",
      "x-block/goose@v1",
    ]) {
      expect(looksLikeAiAction(prefixed), prefixed).toBe(false);
    }
  });

  it("keeps matching tags, SHAs, subpaths, whitespace, and agent container images", () => {
    for (const legitimate of [
      "openai/codex-action@v1",
      "anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567",
      "OpenHands/extensions/plugins/pr-review@main",
      "  google-github-actions/run-gemini-cli@v0 ",
      "docker://ghcr.io/all-hands-ai/openhands:0.9",
      "docker://all-hands-ai/openhands:0.9",
      // Docker's rule: the first path component is a registry when it contains
      // a dot or a colon or is `localhost` (docs.docker.com, image tag). v0.6.1
      // required a dot and lost these (2026-09-09 follow-up review).
      "docker://registry:5000/all-hands-ai/openhands:0.9",
      "docker://localhost:5000/all-hands-ai/openhands:0.9",
      "docker://localhost/all-hands-ai/openhands",
      "docker://GHCR.IO/All-Hands-AI/openhands:0.9",
    ]) {
      expect(looksLikeAiAction(legitimate), legitimate).toBe(true);
    }
    expect(
      looksLikeAiAction("docker://oskarstark/php-cs-fixer-ga:2.18.6"),
    ).toBe(false);
    // Owner identity stays exact behind any registry form.
    for (const prefixed of [
      "docker://ghcr.io/not-all-hands-ai/openhands:0.9",
      "docker://registry:5000/not-all-hands-ai/openhands:0.9",
      "docker://localhost/not-openai/codex-action:1",
    ]) {
      expect(looksLikeAiAction(prefixed), prefixed).toBe(false);
    }
  });
});
