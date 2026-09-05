import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run, type CliIo } from "../src/cli.js";
import { renderOrgMarkdownReport, scanOrganization } from "../src/org.js";
import { toSarif } from "../src/sarif.js";

// A fake GitHub API: enough of /orgs, /users, and /contents to exercise
// pagination, the user-account fallback, archived/fork skipping, a repository
// with no workflows, a repository whose fetch fails, local reusable workflow
// resolution, and the rate-limit error.

// Read whatever workflow each example directory ships, so the fixtures track
// the examples rather than a hard-coded filename.
async function exampleWorkflow(
  name: "vulnerable" | "hardened",
): Promise<string> {
  const dir = `examples/${name}/.github/workflows`;
  const [file] = (await fs.readdir(dir))
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
  return fs.readFile(path.join(dir, file), "utf8");
}
const VULNERABLE = await exampleWorkflow("vulnerable");
const HARDENED = await exampleWorkflow("hardened");
const CALLER = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
  issues: write
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    secrets: inherit
`;
const CALLEE = `
on:
  workflow_call:
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: "Triage: \${{ github.event.issue.title }}"
`;

type Repo = {
  full_name: string;
  archived?: boolean;
  fork?: boolean;
  stars?: number;
  workflows?: Record<string, string> | "404" | "500";
};

function fakeGitHub(
  account: string,
  repos: Repo[],
  { isUser = false, rateLimited = false, pageSize = 100 } = {},
) {
  const calls: Array<{ url: string; auth?: string }> = [];
  const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  const text = (body: string) => new Response(body, { status: 200 });

  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      auth: (init?.headers as Record<string, string> | undefined)
        ?.Authorization,
    });
    if (rateLimited) {
      return json({ message: "rate limited" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1893456000",
      });
    }
    const u = new URL(url);

    const listMatch = u.pathname.match(/^\/(orgs|users)\/([^/]+)\/repos$/);
    if (listMatch) {
      const [, kind, name] = listMatch;
      if (name !== account) return json({ message: "Not Found" }, 404);
      if (kind === "orgs" && isUser) return json({ message: "Not Found" }, 404);
      const page = Number(u.searchParams.get("page") ?? "1");
      const slice = repos.slice((page - 1) * pageSize, page * pageSize);
      return json(
        slice.map((r) => ({
          full_name: r.full_name,
          html_url: `https://github.com/${r.full_name}`,
          default_branch: "main",
          archived: r.archived ?? false,
          fork: r.fork ?? false,
          stargazers_count: r.stars ?? 0,
        })),
      );
    }

    const contentsMatch = u.pathname.match(
      /^\/repos\/([^/]+\/[^/]+)\/contents\/\.github\/workflows$/,
    );
    if (contentsMatch) {
      const repo = repos.find((r) => r.full_name === contentsMatch[1]);
      if (!repo || repo.workflows === "404" || repo.workflows === undefined) {
        return json({ message: "Not Found" }, 404);
      }
      if (repo.workflows === "500") return json({ message: "boom" }, 500);
      return json(
        Object.keys(repo.workflows).map((name) => ({
          type: "file",
          name,
          download_url: `https://raw.example/${repo.full_name}/${name}`,
        })),
      );
    }

    const rawMatch = u.pathname.match(/^\/([^/]+\/[^/]+)\/([^/]+)$/);
    if (u.hostname === "raw.example" && rawMatch) {
      const repo = repos.find((r) => r.full_name === rawMatch[1]);
      const body = (repo?.workflows as Record<string, string>)?.[rawMatch[2]];
      return body === undefined ? json({}, 404) : text(body);
    }

    return json({ message: `unhandled ${url}` }, 500);
  };
  return { fetcher, calls };
}

const REPOS: Repo[] = [
  {
    full_name: "acme/vulnerable",
    stars: 40,
    workflows: { "ai-agent.yml": VULNERABLE },
  },
  { full_name: "acme/hardened", stars: 5, workflows: { "ci.yml": HARDENED } },
  {
    full_name: "acme/reusable",
    stars: 1,
    workflows: { "caller.yml": CALLER, "agent.yml": CALLEE },
  },
  { full_name: "acme/no-workflows", stars: 0, workflows: "404" },
  {
    full_name: "acme/archived",
    archived: true,
    workflows: { "x.yml": HARDENED },
  },
  { full_name: "acme/fork", fork: true, workflows: { "x.yml": VULNERABLE } },
  { full_name: "acme/broken-fetch", stars: 2, workflows: "500" },
];

describe("scanOrganization", () => {
  it("scans every eligible repository and aggregates findings", async () => {
    const { fetcher, calls } = fakeGitHub("acme", REPOS);
    const result = await scanOrganization("acme", {
      fetch: fetcher,
      token: "ghp_test",
    });

    expect(result.org).toBe("acme");
    expect(result.repository_count).toBe(7);
    expect(result.skipped_count).toBe(3); // archived, fork, broken-fetch
    expect(result.scanned_count).toBe(4);
    expect(result.workflow_count).toBe(4); // 1 + 1 + 2 + 0

    const byName = Object.fromEntries(
      result.repositories.map((r) => [r.repository, r]),
    );
    expect(byName["acme/archived"].skipped).toBe("archived");
    expect(byName["acme/fork"].skipped).toBe("fork");
    expect(byName["acme/broken-fetch"].skipped).toMatch(/^fetch failed: .*500/);
    expect(byName["acme/no-workflows"].result?.workflow_count).toBe(0);
    expect(byName["acme/hardened"].result?.findings).toEqual([]);

    // The vulnerable example keeps its exact single-repo result.
    expect(byName["acme/vulnerable"].result?.summary).toEqual({
      critical: 2,
      high: 4,
      medium: 3,
      low: 0,
    });
    // Local reusable workflows resolve through the virtual root.
    const reusableRules = new Set(
      byName["acme/reusable"].result?.findings.map((f) => f.rule_id),
    );
    // Bare claude-code-action on issues with the default gate intact: high, not critical.
    expect(reusableRules).toContain("agentci/gated-ai-write-token");

    // Aggregated findings are prefixed with the repository.
    expect(
      result.findings.every((f) =>
        /^acme\/[^/]+\/\.github\/workflows\//.test(f.file),
      ),
    ).toBe(true);
    expect(result.summary.critical).toBeGreaterThanOrEqual(2);
    // A fetch failure means the organization analysis is not complete.
    expect(result.analysis_complete).toBe(false);

    // Every call carried the token.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.auth === "Bearer ghp_test")).toBe(true);
  });

  it("includes archived repositories and forks on request", async () => {
    const { fetcher } = fakeGitHub("acme", REPOS);
    const result = await scanOrganization("acme", {
      fetch: fetcher,
      includeArchived: true,
      includeForks: true,
    });
    expect(result.scanned_count).toBe(6);
    expect(result.skipped_count).toBe(1);
  });

  it("paginates the repository listing", async () => {
    const many: Repo[] = Array.from({ length: 130 }, (_, i) => ({
      full_name: `big/r${String(i).padStart(3, "0")}`,
      workflows: "404",
    }));
    const { fetcher, calls } = fakeGitHub("big", many);
    const result = await scanOrganization("big", { fetch: fetcher });
    expect(result.repository_count).toBe(130);
    const listCalls = calls.filter((c) => c.url.includes("/orgs/big/repos"));
    expect(
      listCalls.map((c) => new URL(c.url).searchParams.get("page")),
    ).toEqual(["1", "2"]);
  });

  it("falls back to a user account when the organization root is 404", async () => {
    const { fetcher, calls } = fakeGitHub("solo", REPOS.slice(0, 2), {
      isUser: true,
    });
    const result = await scanOrganization("solo", { fetch: fetcher });
    expect(result.repository_count).toBe(2);
    expect(calls.some((c) => c.url.includes("/users/solo/repos"))).toBe(true);
  });

  it("reports an unknown account clearly", async () => {
    const { fetcher } = fakeGitHub("acme", REPOS);
    await expect(
      scanOrganization("nobody", { fetch: fetcher }),
    ).rejects.toThrow(/not found: nobody/);
  });

  it("explains a rate-limit exhaustion instead of failing opaquely", async () => {
    const { fetcher } = fakeGitHub("acme", REPOS, { rateLimited: true });
    await expect(scanOrganization("acme", { fetch: fetcher })).rejects.toThrow(
      /rate limit exhausted.*GITHUB_TOKEN/,
    );
  });
});

describe("organization report", () => {
  it("renders totals, a severity-sorted table, per-repo findings, skips, and incompletes", async () => {
    const { fetcher } = fakeGitHub("acme", REPOS);
    const result = await scanOrganization("acme", { fetch: fetcher });
    const md = renderOrgMarkdownReport(result);

    expect(md).toContain("# AgentCI Guard organization report: acme");
    expect(md).toContain("Scanned 4 of 7 repositories (4 workflows)");
    expect(md).toContain(`| Critical | ${result.summary.critical} |`);
    expect(md).toContain("## Repositories by severity");
    // vulnerable (2 critical) sorts above reusable (1 critical).
    expect(md.indexOf("acme/vulnerable")).toBeLessThan(
      md.indexOf("acme/reusable"),
    );
    expect(md).toContain("## acme/vulnerable");
    expect(md).toContain("**CRITICAL** `agentci/untrusted-ai-write-token`");
    expect(md).toContain("## Skipped");
    expect(md).toContain("- acme/archived: archived");
    expect(md).toMatch(/- acme\/broken-fetch: fetch failed/);
    expect(md).not.toContain("acme/hardened |"); // clean repos are not in the table
  });
});

describe("agentci org, in process", () => {
  function captureIo(): CliIo & { logs: string[]; errors: string[] } {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      logs,
      errors,
      log: (m) => logs.push(m),
      error: (m) => errors.push(m),
    };
  }
  const argv = (...args: string[]) => ["node", "agentci", ...args];

  it("exits 1 when any repository could not be fetched, and writes the report", async () => {
    const { fetcher } = fakeGitHub("acme", REPOS);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-org-"));
    const md = path.join(dir, "out", "org.md");
    const sarif = path.join(dir, "out", "org.sarif");
    const io = captureIo();
    const code = await run(
      argv(
        "org",
        "acme",
        "--markdown",
        md,
        "--sarif",
        sarif,
        "--fail-on",
        "none",
      ),
      io,
      {},
      { fetch: fetcher },
    );
    expect(code).toBe(1);
    expect(io.errors.join("\n")).toMatch(/1 repository could not be fetched/);
    expect(await fs.readFile(md, "utf8")).toContain(
      "organization report: acme",
    );
    const parsed = JSON.parse(await fs.readFile(sarif, "utf8")) as {
      runs: Array<{ results: unknown[] }>;
    };
    const direct = await scanOrganization("acme", {
      fetch: fakeGitHub("acme", REPOS).fetcher,
    });
    expect(parsed.runs[0].results.length).toBe(direct.findings.length);
    expect(direct.findings.length).toBeGreaterThan(0);
  });

  it("exits 2 at the default threshold when every repository fetched", async () => {
    const clean = REPOS.filter((r) => r.workflows !== "500");
    const { fetcher } = fakeGitHub("acme", clean);
    const io = captureIo();
    expect(await run(argv("org", "acme"), io, {}, { fetch: fetcher })).toBe(2);
    expect(io.logs.join("\n")).toContain("# AgentCI Guard organization report");
  });

  it("exits 0 for an organization with only clean repositories and emits JSON", async () => {
    const { fetcher } = fakeGitHub("tidy", [
      { full_name: "tidy/a", workflows: { "ci.yml": HARDENED } },
      { full_name: "tidy/b", workflows: "404" },
    ]);
    const io = captureIo();
    expect(
      await run(argv("org", "tidy", "--json"), io, {}, { fetch: fetcher }),
    ).toBe(0);
    const parsed = JSON.parse(io.logs.join("\n")) as {
      scanned_count: number;
      analysis_complete: boolean;
    };
    expect(parsed.scanned_count).toBe(2);
    expect(parsed.analysis_complete).toBe(true);
  });

  it("reads the token from GITHUB_TOKEN when --token is absent", async () => {
    const { fetcher, calls } = fakeGitHub("tidy", [
      { full_name: "tidy/a", workflows: "404" },
    ]);
    await run(
      argv("org", "tidy"),
      captureIo(),
      { GITHUB_TOKEN: "env_tok" },
      {
        fetch: fetcher,
      },
    );
    expect(calls.every((c) => c.auth === "Bearer env_tok")).toBe(true);
  });
});

const REMOTE_REUSABLE = `
on: push
jobs:
  delegated:
    uses: example/shared/.github/workflows/ci.yml@v1
`;

// Roadmap Day 3: an organization report must not call an incomplete
// zero-finding repository clean. Every scanned repository lands in exactly one
// of five categories that sum to the scanned count; skipped ones stay outside.
describe("scanOrganization completeness categories", () => {
  const repos: Repo[] = [
    { full_name: "acme/clean-complete", workflows: { "ci.yml": HARDENED } },
    {
      full_name: "acme/clean-incomplete",
      workflows: { "ci.yml": REMOTE_REUSABLE },
    },
    {
      full_name: "acme/findings-complete",
      workflows: { "agent.yml": VULNERABLE },
    },
    {
      full_name: "acme/findings-incomplete",
      workflows: { "agent.yml": VULNERABLE, "d.yml": REMOTE_REUSABLE },
    },
    { full_name: "acme/no-workflows", workflows: "404" },
    { full_name: "acme/broken-fetch", workflows: "500" },
    {
      full_name: "acme/archived",
      archived: true,
      workflows: { "x.yml": HARDENED },
    },
  ];

  it("puts every scanned repository in exactly one category", async () => {
    const { fetcher } = fakeGitHub("acme", repos);
    const result = await scanOrganization("acme", { fetch: fetcher });
    expect(result.scanned_count).toBe(5);
    expect(result.skipped_count).toBe(2);
    expect(result.categories).toEqual({
      complete_with_findings: 1,
      complete_no_findings: 1,
      incomplete_with_findings: 1,
      incomplete_no_findings: 1,
      no_workflows: 1,
    });
    expect(Object.values(result.categories).reduce((a, b) => a + b, 0)).toBe(
      result.scanned_count,
    );
    expect(result.analysis_complete).toBe(false);
    // Diagnostics travel with the result, prefixed like findings are; since
    // review finding 2 (v0.6.0) a fetch failure is one of them.
    expect(result.diagnostics.map((d) => d.file).sort()).toEqual([
      "acme/broken-fetch/.github/workflows",
      "acme/clean-incomplete/.github/workflows/ci.yml",
      "acme/findings-incomplete/.github/workflows/d.yml",
    ]);
  });

  it("renders the categories and names the incomplete repositories", async () => {
    const { fetcher } = fakeGitHub("acme", repos);
    const md = renderOrgMarkdownReport(
      await scanOrganization("acme", { fetch: fetcher }),
    );
    expect(md).toContain("| Complete, with findings | 1 |");
    expect(md).toContain("| Complete, no findings | 1 |");
    expect(md).toContain("| Incomplete, with findings | 1 |");
    expect(md).toContain("| Incomplete, no findings | 1 |");
    expect(md).toContain("| No workflows | 1 |");
    expect(md).toContain("| Repositories skipped | 2 |");
    expect(md).not.toMatch(/Repositories clean/);
    expect(md).toMatch(
      /acme\/clean-incomplete: agentci\/analysis-remote-reusable-workflow/,
    );
  });
});

// Review findings 1 and 2 (2026-09-05).
describe("agentci org: error diagnostics and fetch failures are not swallowed", () => {
  function captureIo(): CliIo & { logs: string[]; errors: string[] } {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      logs,
      errors,
      log: (m) => logs.push(m),
      error: (m) => errors.push(m),
    };
  }
  const BROKEN = "on: [push\njobs: {}\n";
  const parseFailure: Repo[] = [
    { full_name: "acme/hardened", workflows: { "ci.yml": HARDENED } },
    { full_name: "acme/broken-yaml", workflows: { "broken.yml": BROKEN } },
  ];

  it("exits 1 on a parse error even at --fail-on none, and still writes the report (finding 1)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-org-err-"));
    const md = path.join(dir, "org.md");
    const sarif = path.join(dir, "org.sarif");
    const io = captureIo();
    const code = await run(
      [
        "node",
        "agentci",
        "org",
        "acme",
        "--fail-on",
        "none",
        "--markdown",
        md,
        "--sarif",
        sarif,
        "--json",
      ],
      io,
      {},
      { fetch: fakeGitHub("acme", parseFailure).fetcher },
    );
    expect(code).toBe(1);
    expect(io.errors.join("\n")).toMatch(/1 workflow\(s\) failed to parse/);
    const printed = JSON.parse(io.logs.join("\n")) as {
      analysis_complete: boolean;
    };
    expect(printed.analysis_complete).toBe(false);
    expect(await fs.readFile(md, "utf8")).toContain(
      "organization report: acme",
    );
    const exported = JSON.parse(await fs.readFile(sarif, "utf8")) as {
      runs: Array<{
        invocations: Array<{
          executionSuccessful: boolean;
          toolExecutionNotifications: Array<{
            descriptor: { id: string };
            level: string;
          }>;
        }>;
      }>;
    };
    expect(exported.runs[0].invocations[0].executionSuccessful).toBe(false);
    expect(
      exported.runs[0].invocations[0].toolExecutionNotifications.map(
        (n) => `${n.descriptor.id}/${n.level}`,
      ),
    ).toEqual(["agentci/parse-error/error"]);
  });

  it("exits 1 on a parse error at the default threshold too: error outranks findings (finding 1)", async () => {
    const io = captureIo();
    const code = await run(
      ["node", "agentci", "org", "acme"],
      io,
      {},
      { fetch: fakeGitHub("acme", parseFailure).fetcher },
    );
    expect(code).toBe(1);
  });

  it("records a fetch failure as an error diagnostic that reaches SARIF; deliberate skips do not (finding 2)", async () => {
    const result = await scanOrganization("acme", {
      fetch: fakeGitHub("acme", REPOS).fetcher,
    });
    const fetchDiagnostics = result.diagnostics.filter(
      (d) => d.code === "agentci/org-fetch-failed",
    );
    expect(fetchDiagnostics).toHaveLength(1);
    expect(fetchDiagnostics[0]).toMatchObject({
      severity: "error",
      kind: "analysis",
      file: "acme/broken-fetch/.github/workflows",
    });
    expect(fetchDiagnostics[0].message).toMatch(
      /GitHub API 500 listing workflows/,
    );
    // Archived and fork skips are exclusions, not failures.
    expect(
      result.diagnostics.some(
        (d) =>
          d.file.startsWith("acme/archived") || d.file.startsWith("acme/fork"),
      ),
    ).toBe(false);

    const sarif = toSarif(result).runs[0];
    expect(sarif.invocations?.[0]?.executionSuccessful).toBe(false);
    const notification =
      sarif.invocations?.[0]?.toolExecutionNotifications.find(
        (n) => n.descriptor.id === "agentci/org-fetch-failed",
      );
    expect(notification?.level).toBe("error");
    expect(
      notification?.locations?.[0]?.physicalLocation.artifactLocation.uri,
    ).toBe("acme/broken-fetch/.github/workflows");
    expect(notification?.message.text).toMatch(/acme\/broken-fetch/);
  });
});
