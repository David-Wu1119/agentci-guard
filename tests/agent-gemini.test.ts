import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";
import { looksLikeAiAction } from "../src/detect.js";

// Review finding 3 (2026-09-05): `google-github-actions/run-gemini-cli` was
// not in the detector's action patterns, so a workflow that hands an untrusted
// comment body to Gemini in a job with `contents: write` scanned as "no
// agent, no findings, analysis complete". The action's contract (action.yml,
// upstream main): `prompt` goes to the CLI's --prompt; `github_issue_number`
// and `github_pr_number` default to the triggering event's payload; `settings`
// writes .gemini/settings.json (where MCP servers are configured). It has no
// documented write-access gate, so it is treated like the other agent actions:
// presumed to read the event itself, not self-gating.

function scan(raw: string) {
  const file: WorkflowFile = {
    path: ".github/workflows/gemini.yml",
    document: YAML.parse(raw),
    raw,
  };
  return scanWorkflow(file, ".");
}
const rules = (raw: string) => new Set(scan(raw).map((f) => f.rule_id));

const UAWT = "agentci/untrusted-ai-write-token";
const GATED = "agentci/gated-ai-write-token";
const PRT = "agentci/pull-request-target-ai";
const PROMPT = "agentci/untrusted-input-in-prompt";

const RISKY = `
on: issue_comment
permissions:
  contents: write
jobs:
  gemini:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/run-gemini-cli@a3bf79042542528e91937b3a3a6fbc4967ee3c31
        with:
          gemini_api_key: \${{ secrets.GEMINI_API_KEY }}
          prompt: \${{ github.event.comment.body }}
`;

describe("google-github-actions/run-gemini-cli is an agent action", () => {
  it("recognizes the exact action and its archived predecessor, not the vendor's other actions", () => {
    expect(looksLikeAiAction("google-github-actions/run-gemini-cli@v0")).toBe(
      true,
    );
    expect(
      looksLikeAiAction(
        "google-github-actions/run-gemini-cli@a3bf79042542528e91937b3a3a6fbc4967ee3c31",
      ),
    ).toBe(true);
    expect(looksLikeAiAction("google-gemini/gemini-cli-action@v0")).toBe(true);
    for (const lookalike of [
      "google-github-actions/auth@v2",
      "google-github-actions/setup-gcloud@v2",
      "google-github-actions/deploy-cloudrun@v2",
      "google-github-actions/run-gemini-cli-docs@v1",
      "google-gemini/gemini-cli@v1",
    ]) {
      expect(looksLikeAiAction(lookalike), lookalike).toBe(false);
    }
  });

  it("flags untrusted comment text reaching Gemini in a write-token job (review finding 3 fixture)", () => {
    const found = rules(RISKY);
    expect(found).toContain(UAWT);
    expect(found).toContain(PROMPT);
    expect(found).not.toContain(GATED); // no documented write-access gate
  });

  it("still flags the write-token job without interpolation: the action operates on the event's issue itself", () => {
    const found = rules(
      RISKY.replace("          prompt: ${{ github.event.comment.body }}\n", ""),
    );
    expect(found).toContain(UAWT);
    expect(found).not.toContain(PROMPT);
  });

  it("does not raise the three privileged-agent rules on schedule/dispatch triggers (the u-06 shape)", () => {
    const raw = RISKY.replace(
      "on: issue_comment",
      "on:\n  schedule:\n    - cron: '0 0 * * 1'\n  workflow_dispatch:",
    ).replace(
      "          prompt: ${{ github.event.comment.body }}\n",
      "          prompt: Audit the docs\n",
    );
    const found = rules(raw);
    expect(found).not.toContain(UAWT);
    expect(found).not.toContain(GATED);
    expect(found).not.toContain(PRT);
    // It is still an agent: hygiene rules that only need an agent step apply.
    expect(found).toContain("agentci/broad-write-permissions");
  });

  it("does not raise untrusted-ai-write-token when the job is read-only", () => {
    const found = rules(RISKY.replace("contents: write", "contents: read"));
    expect(found).not.toContain(UAWT);
    expect(found).toContain(PROMPT);
  });

  it("raises pull-request-target-ai when reachable on pull_request_target without a gate", () => {
    expect(
      rules(RISKY.replace("on: issue_comment", "on: pull_request_target")),
    ).toContain(PRT);
  });

  it("scans the vendor's non-agent actions as ordinary CI", () => {
    const raw = `
on: issue_comment
permissions:
  contents: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: \${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud run deploy app --source .
`;
    expect(scan(raw)).toEqual([]);
  });
});
