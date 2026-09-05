#!/usr/bin/env node
// Implements PROTOCOL.md mechanically. Run from the repository root:
//   node evidence/sprint-2026-09-05/day5/collect.mjs
// Writes search-results/, snapshots/, manifest.json, and a replacement log.
// The developer does not read any fetched content during this step.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../../..");
const gh = (args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const api = (endpoint) => JSON.parse(gh(["api", "-X", "GET", endpoint]));

const AGENT_PATTERNS = [
  /anthropics\/claude-code-(base-)?action/i,
  /openai\/codex-action/i,
  /google-github-actions\/run-gemini-cli/i,
  /All-Hands-AI\/openhands/i,
  /openhands\//i,
  /\bclaude\b/i,
  /\bcodex\b/i,
  /gemini/i,
  /\baider\b/i,
  /cursor/i,
  /devin/i,
  /copilot/i,
];

const GROUPS = [
  {
    group: "G1-claude",
    target: 4,
    queries: [
      { id: "G1", q: '"anthropics/claude-code-action" path:.github/workflows', must: /anthropics\/claude-code-(base-)?action/i },
    ],
  },
  {
    group: "G2-other-agent",
    target: 4,
    queries: [
      { id: "G2a", q: '"openai/codex-action" path:.github/workflows', must: /openai\/codex-action/i },
      { id: "G2b", q: '"google-github-actions/run-gemini-cli" path:.github/workflows', must: /google-github-actions\/run-gemini-cli/i },
      { id: "G2c", q: '"All-Hands-AI/openhands" path:.github/workflows', must: /All-Hands-AI\/openhands|openhands\//i },
    ],
  },
  {
    group: "G3-control",
    target: 4,
    queries: [
      { id: "G3", q: '"actions/setup-node" "npm test" path:.github/workflows', mustNot: AGENT_PATTERNS },
    ],
  },
];

const excluded = new Set(
  JSON.parse(fs.readFileSync(path.join(root, "benchmark/manifest.json"), "utf8"))
    .cases.map((c) => c.repository.toLowerCase()),
);
excluded.add("david-wu1119/agentci-guard");

fs.mkdirSync(path.join(here, "search-results"), { recursive: true });
const selected = [];
const replacements = [];
const selectedRepos = new Set();
const startedAt = new Date().toISOString();

const searchCache = new Map();
function search(query) {
  if (searchCache.has(query.id)) return searchCache.get(query.id);
  const endpoint = `search/code?q=${encodeURIComponent(query.q)}&sort=indexed&order=desc&per_page=100`;
  const response = api(endpoint);
  fs.writeFileSync(
    path.join(here, "search-results", `${query.id}.json`),
    JSON.stringify({ fetched_at: new Date().toISOString(), endpoint, total_count: response.total_count, items: response.items.map((i) => ({ repository: i.repository.full_name, path: i.path, html_url: i.html_url })) }, null, 2) + "\n",
  );
  const state = { items: response.items, cursor: 0 };
  searchCache.set(query.id, state);
  return state;
}

function reject(query, item, rank, reason) {
  replacements.push({ group_query: query.id, rank, repository: item.repository.full_name, path: item.path, reason });
}

function tryItem(query, item, rank, groupName) {
  const repo = item.repository.full_name;
  if (excluded.has(repo.toLowerCase())) return reject(query, item, rank, "1: repository in benchmark/corpus/exclusion list");
  if (selectedRepos.has(repo.toLowerCase())) return reject(query, item, rank, "2: repository already selected");
  const meta = api(`repos/${repo}`);
  if (meta.archived) return reject(query, item, rank, "3: archived");
  if (meta.fork) return reject(query, item, rank, "3: fork");
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(item.path)) return reject(query, item, rank, "4: not directly under .github/workflows with yml/yaml suffix");
  const head = api(`repos/${repo}/commits/${encodeURIComponent(meta.default_branch)}`).sha;
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${head}/${item.path}`;
  let raw;
  try {
    raw = execFileSync("curl", ["-fsSL", rawUrl], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  } catch {
    return reject(query, item, rank, "5: not fetchable at head commit");
  }
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > 200 * 1024) return reject(query, item, rank, "5: larger than 200 KB");
  let doc;
  try {
    doc = YAML.parse(raw);
  } catch {
    return reject(query, item, rank, "6: YAML parse failure");
  }
  if (!doc || typeof doc !== "object" || !doc.jobs || typeof doc.jobs !== "object") return reject(query, item, rank, "6: no top-level jobs mapping");
  if (query.must && !query.must.test(raw)) return reject(query, item, rank, "7: does not match the group's agent pattern");
  if (query.mustNot && query.mustNot.some((p) => p.test(raw))) return reject(query, item, rank, "7: control matches an agent pattern");

  const caseId = `u-${String(selected.length + 1).padStart(2, "0")}`;
  const dir = path.join(here, "snapshots", caseId, ".github", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, path.basename(item.path)), raw);
  selected.push({
    case_id: caseId,
    group: groupName,
    group_query: query.id,
    search_rank: rank,
    repository: repo,
    path: item.path,
    default_branch: meta.default_branch,
    head_commit: head,
    raw_url: rawUrl,
    sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    bytes,
    collected_at: new Date().toISOString(),
  });
  selectedRepos.add(repo.toLowerCase());
  return true;
}

for (const group of GROUPS) {
  let taken = 0;
  let cycle = 0;
  let exhausted = 0;
  while (taken < group.target && exhausted < group.queries.length) {
    const query = group.queries[cycle % group.queries.length];
    cycle++;
    const state = search(query);
    let got = false;
    while (state.cursor < state.items.length) {
      const rank = state.cursor + 1;
      const item = state.items[state.cursor++];
      if (tryItem(query, item, rank, group.group) === true) {
        got = true;
        break;
      }
    }
    if (got) {
      taken++;
      exhausted = 0;
    } else {
      exhausted++;
    }
  }
  if (taken < group.target) replacements.push({ group_query: group.group, reason: `shortfall: ${taken} of ${group.target} filled` });
}

fs.writeFileSync(
  path.join(here, "manifest.json"),
  JSON.stringify({ protocol: "PROTOCOL.md", started_at: startedAt, finished_at: new Date().toISOString(), cases: selected, replacements }, null, 2) + "\n",
);
console.log(`selected ${selected.length} cases; ${replacements.length} replacement/shortfall records`);
for (const c of selected) console.log(`  ${c.case_id} ${c.group} ${c.repository} ${c.path}`);
