import { parseWorkflowFile, scanWorkflowFiles } from "./scanner.js";
import type { AgentciConfig } from "./config.js";
import type { Diagnostic, Finding, ScanResult, Severity } from "./types.js";

/**
 * Scan every repository in a GitHub organization (or user account) without
 * cloning anything: list repositories, fetch each one's workflow files through
 * the contents API, and run the same analysis the CLI runs on a checkout.
 *
 * This is the unit an audit or posture engagement actually delivers -- one
 * report across an organization -- rather than one scan per checkout.
 */

export type OrgRepository = {
  full_name: string;
  html_url: string;
  default_branch: string;
  archived: boolean;
  fork: boolean;
  stargazers_count: number;
};

export type OrgRepositoryResult = {
  repository: string;
  url: string;
  stars: number;
  archived: boolean;
  fork: boolean;
  /** Present when the repository was not analyzed, with the reason. */
  skipped?: string;
  result?: ScanResult;
};

/**
 * Every scanned repository lands in exactly one category, so the five sum to
 * `scanned_count`. Skipped repositories (archived, fork, fetch failed) are
 * outside all five. "No workflows" is separated because a repository with
 * nothing to analyze is evidence of nothing, not a clean result.
 */
export type OrgCategories = {
  complete_with_findings: number;
  complete_no_findings: number;
  incomplete_with_findings: number;
  incomplete_no_findings: number;
  no_workflows: number;
};

export type OrgScanResult = {
  scanned_at: string;
  org: string;
  repository_count: number;
  scanned_count: number;
  skipped_count: number;
  workflow_count: number;
  repositories: OrgRepositoryResult[];
  findings: Finding[];
  /** Every scanned repository's diagnostics, files prefixed by repository. */
  diagnostics: Diagnostic[];
  summary: Record<Severity, number>;
  categories: OrgCategories;
  analysis_complete: boolean;
};

export type OrgScanOptions = {
  /** GitHub token. Unauthenticated requests are limited to 60 per hour. */
  token?: string;
  includeArchived?: boolean;
  includeForks?: boolean;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  apiBase?: string;
  /** Repositories fetched in parallel. */
  concurrency?: number;
  config?: AgentciConfig;
};

const EMPTY_CONFIG: AgentciConfig = { ignore: [], ignorePaths: [] };

export async function scanOrganization(
  org: string,
  options: OrgScanOptions = {},
): Promise<OrgScanResult> {
  const fetcher = options.fetch ?? fetch;
  const apiBase = (options.apiBase ?? "https://api.github.com").replace(
    /\/$/,
    "",
  );
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "agentci-guard",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const api = async (url: string): Promise<Response> => {
    const response = await fetcher(url, { headers });
    if (
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0"
    ) {
      const reset = response.headers.get("x-ratelimit-reset");
      const when = reset
        ? new Date(Number(reset) * 1000).toISOString()
        : "unknown";
      throw new Error(
        `GitHub API rate limit exhausted (resets ${when}). Provide a token via --token or GITHUB_TOKEN.`,
      );
    }
    return response;
  };

  const repositories = await listRepositories(org, api, apiBase);
  const config = options.config ?? EMPTY_CONFIG;
  const results: OrgRepositoryResult[] = new Array(repositories.length);

  let index = 0;
  const workers = Array.from(
    { length: Math.max(1, options.concurrency ?? 4) },
    async () => {
      while (index < repositories.length) {
        const position = index++;
        const repo = repositories[position];
        results[position] = await scanOne(repo, api, apiBase, config, options);
      }
    },
  );
  await Promise.all(workers);

  const scanned = results.filter((entry) => entry.result !== undefined);
  const findings = scanned.flatMap((entry) =>
    (entry.result as ScanResult).findings.map((finding) => ({
      ...finding,
      file: `${entry.repository}/${finding.file}`,
    })),
  );
  const summary: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) summary[finding.severity]++;
  const diagnostics: Diagnostic[] = [
    ...scanned.flatMap((entry) =>
      (entry.result as ScanResult).diagnostics.map((diagnostic) => ({
        ...diagnostic,
        file: `${entry.repository}/${diagnostic.file}`,
      })),
    ),
    // A repository that could not be fetched is a hole in the report. It is
    // recorded as an error diagnostic so SARIF and JSON consumers see which
    // repository and why; archived and fork skips are exclusions, not errors.
    ...results
      .filter((entry) => entry.skipped?.startsWith("fetch failed"))
      .map(
        (entry): Diagnostic => ({
          code: "agentci/org-fetch-failed",
          kind: "analysis",
          severity: "error",
          file: `${entry.repository}/.github/workflows`,
          message: `Repository ${entry.repository} could not be fetched and was not analyzed: ${(entry.skipped as string).replace(/^fetch failed: /, "")}`,
        }),
      ),
  ];

  return {
    scanned_at: new Date().toISOString(),
    org,
    repository_count: repositories.length,
    scanned_count: scanned.length,
    skipped_count: results.length - scanned.length,
    workflow_count: scanned.reduce(
      (total, entry) => total + (entry.result as ScanResult).workflow_count,
      0,
    ),
    repositories: results,
    findings,
    diagnostics,
    summary,
    categories: categorize(scanned),
    analysis_complete:
      results.every(
        (entry) =>
          entry.skipped === undefined ||
          entry.skipped === "archived" ||
          entry.skipped === "fork",
      ) &&
      scanned.every((entry) => (entry.result as ScanResult).analysis_complete),
  };
}

function categorize(scanned: OrgRepositoryResult[]): OrgCategories {
  const categories: OrgCategories = {
    complete_with_findings: 0,
    complete_no_findings: 0,
    incomplete_with_findings: 0,
    incomplete_no_findings: 0,
    no_workflows: 0,
  };
  for (const entry of scanned) {
    const r = entry.result as ScanResult;
    if (r.workflow_count === 0) categories.no_workflows++;
    else if (r.analysis_complete && r.findings.length > 0)
      categories.complete_with_findings++;
    else if (r.analysis_complete) categories.complete_no_findings++;
    else if (r.findings.length > 0) categories.incomplete_with_findings++;
    else categories.incomplete_no_findings++;
  }
  return categories;
}

async function listRepositories(
  org: string,
  api: (url: string) => Promise<Response>,
  apiBase: string,
): Promise<OrgRepository[]> {
  // Organizations and user accounts expose the same repository shape under
  // different roots; try the organization root first and fall back to a user.
  for (const root of [`orgs/${org}`, `users/${org}`]) {
    const collected: OrgRepository[] = [];
    let page = 1;
    let notFound = false;
    for (;;) {
      const response = await api(
        `${apiBase}/${root}/repos?per_page=100&type=all&sort=full_name&page=${page}`,
      );
      if (response.status === 404) {
        notFound = true;
        break;
      }
      if (!response.ok) {
        throw new Error(
          `GitHub API ${response.status} listing repositories for ${org}`,
        );
      }
      const batch = (await response.json()) as OrgRepository[];
      collected.push(
        ...batch.map((repo) => ({
          full_name: repo.full_name,
          html_url: repo.html_url,
          default_branch: repo.default_branch,
          archived: Boolean(repo.archived),
          fork: Boolean(repo.fork),
          stargazers_count: Number(repo.stargazers_count ?? 0),
        })),
      );
      if (batch.length < 100) break;
      page++;
    }
    if (!notFound) return collected;
  }
  throw new Error(`GitHub organization or user not found: ${org}`);
}

async function scanOne(
  repo: OrgRepository,
  api: (url: string) => Promise<Response>,
  apiBase: string,
  config: AgentciConfig,
  options: OrgScanOptions,
): Promise<OrgRepositoryResult> {
  const base: OrgRepositoryResult = {
    repository: repo.full_name,
    url: repo.html_url,
    stars: repo.stargazers_count,
    archived: repo.archived,
    fork: repo.fork,
  };
  if (repo.archived && !options.includeArchived) {
    return { ...base, skipped: "archived" };
  }
  if (repo.fork && !options.includeForks) {
    return { ...base, skipped: "fork" };
  }

  try {
    const files = await fetchWorkflowFiles(repo, api, apiBase);
    // A virtual absolute root keeps local reusable-workflow references
    // (`./.github/workflows/x.yml`) resolvable exactly as they are on disk.
    const root = `/${repo.full_name}`;
    const workflows = files.map((file) =>
      parseWorkflowFile(`${root}/.github/workflows/${file.name}`, file.raw),
    );
    return { ...base, result: scanWorkflowFiles(workflows, root, config) };
  } catch (error) {
    return {
      ...base,
      skipped: `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function fetchWorkflowFiles(
  repo: OrgRepository,
  api: (url: string) => Promise<Response>,
  apiBase: string,
): Promise<Array<{ name: string; raw: string }>> {
  const listing = await api(
    `${apiBase}/repos/${repo.full_name}/contents/.github/workflows?ref=${encodeURIComponent(repo.default_branch)}`,
  );
  if (listing.status === 404) return [];
  if (!listing.ok) {
    throw new Error(`GitHub API ${listing.status} listing workflows`);
  }
  const entries = (await listing.json()) as Array<{
    type: string;
    name: string;
    download_url: string | null;
  }>;
  if (!Array.isArray(entries)) return [];

  const files: Array<{ name: string; raw: string }> = [];
  for (const entry of entries) {
    if (entry.type !== "file" || !/\.ya?ml$/i.test(entry.name)) continue;
    if (!entry.download_url) continue;
    const response = await api(entry.download_url);
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} fetching ${entry.name}`);
    }
    files.push({ name: entry.name, raw: await response.text() });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/** The audit deliverable: one Markdown report across the organization. */
export function renderOrgMarkdownReport(result: OrgScanResult): string {
  const scanned = result.repositories.filter((r) => r.result !== undefined);
  const flagged = scanned
    .filter((r) => (r.result as ScanResult).findings.length > 0)
    .sort(
      (a, b) =>
        (b.result as ScanResult).summary.critical -
          (a.result as ScanResult).summary.critical ||
        (b.result as ScanResult).summary.high -
          (a.result as ScanResult).summary.high ||
        b.stars - a.stars,
    );
  const skipped = result.repositories.filter((r) => r.skipped !== undefined);
  const incomplete = scanned.filter(
    (r) => !(r.result as ScanResult).analysis_complete,
  );

  const lines: string[] = [
    `# AgentCI Guard organization report: ${result.org}`,
    "",
    `Scanned ${result.scanned_count} of ${result.repository_count} repositories (${result.workflow_count} workflows) on ${result.scanned_at.slice(0, 10)}.`,
    "",
    "| | Count |",
    "|---|---:|",
    `| Critical | ${result.summary.critical} |`,
    `| High | ${result.summary.high} |`,
    `| Medium | ${result.summary.medium} |`,
    `| Low | ${result.summary.low} |`,
    `| Complete, with findings | ${result.categories.complete_with_findings} |`,
    `| Complete, no findings | ${result.categories.complete_no_findings} |`,
    `| Incomplete, with findings | ${result.categories.incomplete_with_findings} |`,
    `| Incomplete, no findings | ${result.categories.incomplete_no_findings} |`,
    `| No workflows | ${result.categories.no_workflows} |`,
    `| Repositories skipped | ${skipped.length} |`,
    "",
    "Findings are review hypotheses from static analysis of workflow YAML. The",
    `five categories above sum to the ${scanned.length} scanned repositories.`,
    '"Complete, no findings" is the only category in which the analyzer read',
    'every construct and reported nothing. "Incomplete" means it met a construct',
    "it could not interpret and kept a conservative reading; an incomplete scan",
    "with no findings is not a clean result. Skipped repositories (archived,",
    'forks, fetch failures) were not analyzed at all. See "What it cannot see"',
    "in the README before acting on any single line.",
    "",
  ];

  if (flagged.length > 0) {
    lines.push(
      "## Repositories by severity",
      "",
      "| Repository | ★ | Critical | High | Medium | Complete |",
      "|---|---:|---:|---:|---:|:---:|",
    );
    for (const entry of flagged) {
      const r = entry.result as ScanResult;
      lines.push(
        `| [${entry.repository}](${entry.url}) | ${entry.stars} | ${r.summary.critical} | ${r.summary.high} | ${r.summary.medium} | ${r.analysis_complete ? "yes" : "no"} |`,
      );
    }
    lines.push("");
    for (const entry of flagged) {
      const r = entry.result as ScanResult;
      lines.push(`## ${entry.repository}`, "");
      for (const finding of r.findings) {
        lines.push(
          `- **${finding.severity.toUpperCase()}** \`${finding.rule_id}\` — ${finding.file}${finding.line ? `:${finding.line}` : ""}${finding.job ? ` (job \`${finding.job}\`)` : ""}`,
          `  ${finding.evidence.replace(/\s+/g, " ")}`,
        );
      }
      lines.push("");
    }
  }

  if (skipped.length > 0) {
    lines.push("## Skipped", "");
    for (const entry of skipped) {
      lines.push(`- ${entry.repository}: ${entry.skipped}`);
    }
    lines.push("");
  }

  if (incomplete.length > 0) {
    lines.push("## Incomplete analysis", "");
    for (const entry of incomplete) {
      const r = entry.result as ScanResult;
      const codes = [...new Set(r.diagnostics.map((d) => d.code))].join(", ");
      lines.push(`- ${entry.repository}: ${codes}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
