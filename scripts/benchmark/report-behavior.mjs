#!/usr/bin/env node
// Behavioral regression report over the frozen benchmark.
//
// Scans exactly the cases named in benchmark/manifest.json and writes a
// per-case JSON record plus a compact Markdown summary. The purpose is to make
// every detector change explainable: run it before and after, then `--compare`
// the two JSON files to see which cases moved and how.
//
// This is a behavioral report, not an accuracy measurement. Counts of alerts
// are not precision, recall, or confirmations of exploitability; the labeling
// protocol in BENCHMARK.md is the only path to those.
//
// Usage:
//   node scripts/benchmark/report-behavior.mjs --out evidence/<dir>
//   node scripts/benchmark/report-behavior.mjs --compare before/cases.json after/cases.json

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

if (args.includes("--compare")) {
  const index = args.indexOf("--compare");
  compare(args[index + 1], args[index + 2]);
} else {
  const out = flag("--out") ?? "evidence/behavior";
  report(out);
}

function report(outDir) {
  const manifest = JSON.parse(readFileSync("benchmark/manifest.json", "utf8"));
  const cases = [...manifest.cases].sort((a, b) =>
    a.case_id.localeCompare(b.case_id),
  );
  const records = [];
  for (const entry of cases) {
    const dir = `benchmark/snapshots/${entry.case_id}`;
    let scan;
    try {
      const stdout = execFileSync(
        "node",
        ["dist/cli.js", "scan", dir, "--json", "--fail-on", "none"],
        {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      scan = JSON.parse(stdout);
    } catch (error) {
      // The scanner exits 1 on a parse error but still prints JSON; keep it.
      const stdout = error.stdout ? String(error.stdout) : "";
      try {
        scan = JSON.parse(stdout);
      } catch {
        records.push({
          case_id: entry.case_id,
          repository: entry.repository,
          source_url: entry.source_url,
          stratum: entry.stratum,
          scanned: false,
          failure: (error.stderr ? String(error.stderr) : String(error.message))
            .trim()
            .slice(0, 400),
        });
        continue;
      }
    }
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of scan.findings) bySeverity[finding.severity]++;
    records.push({
      case_id: entry.case_id,
      repository: entry.repository,
      source_url: entry.source_url,
      stratum: entry.stratum,
      scanned: true,
      workflow_count: scan.workflow_count,
      analysis_complete: scan.analysis_complete,
      agent_usages: scan.agent_usages.length,
      findings: scan.findings
        .map((finding) => ({
          rule_id: finding.rule_id,
          severity: finding.severity,
          file: finding.file,
          job: finding.job ?? null,
          step: finding.step ?? null,
          line: finding.line ?? null,
        }))
        .sort(sortFinding),
      by_severity: bySeverity,
      diagnostics: scan.diagnostics
        .map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity,
          file: diagnostic.file,
          job: diagnostic.job ?? null,
          line: diagnostic.line ?? null,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    });
  }

  mkdirSync(outDir, { recursive: true });
  const meta = {
    generated_at: new Date().toISOString(),
    commit: git("rev-parse HEAD"),
    working_tree_changes: git("status --porcelain").split("\n").filter(Boolean)
      .length,
    benchmark_id: manifest.benchmark_id,
    manifest_case_count: manifest.cases.length,
    scanner_version: JSON.parse(readFileSync("package.json", "utf8")).version,
  };
  writeFileSync(
    path.join(outDir, "cases.json"),
    JSON.stringify({ meta, cases: records }, null, 2) + "\n",
  );
  writeFileSync(path.join(outDir, "summary.md"), summarize(meta, records));
  console.log(
    `wrote ${records.length} case records to ${outDir}/cases.json and ${outDir}/summary.md`,
  );
}

function summarize(meta, records) {
  const scanned = records.filter((r) => r.scanned);
  const failed = records.filter((r) => !r.scanned);
  const totals = { critical: 0, high: 0, medium: 0, low: 0 };
  const ruleCounts = new Map();
  const diagCounts = new Map();
  const quadrant = {
    "complete, with findings": [],
    "complete, no findings": [],
    "incomplete, with findings": [],
    "incomplete, no findings": [],
  };
  for (const r of scanned) {
    for (const k of Object.keys(totals)) totals[k] += r.by_severity[k];
    for (const f of r.findings)
      ruleCounts.set(f.rule_id, (ruleCounts.get(f.rule_id) ?? 0) + 1);
    for (const d of r.diagnostics)
      diagCounts.set(d.code, (diagCounts.get(d.code) ?? 0) + 1);
    const key = `${r.analysis_complete ? "complete" : "incomplete"}, ${r.findings.length > 0 ? "with findings" : "no findings"}`;
    quadrant[key].push(r.case_id);
  }
  const criticalRepos = scanned.filter((r) => r.by_severity.critical > 0);
  const lines = [
    `# Benchmark behavioral report`,
    ``,
    `Generated ${meta.generated_at} at commit \`${meta.commit.slice(0, 7)}\` (scanner ${meta.scanner_version}, working tree changes: ${meta.working_tree_changes}). Benchmark \`${meta.benchmark_id}\`, ${meta.manifest_case_count} manifest cases.`,
    ``,
    `This is a behavioral report. Alert counts are not precision, recall, or exploit confirmations.`,
    ``,
    `| | Count |`,
    `|---|---:|`,
    `| Cases in manifest | ${records.length} |`,
    `| Cases scanned | ${scanned.length} |`,
    `| Cases failed to scan | ${failed.length} |`,
    `| Critical findings | ${totals.critical} |`,
    `| High findings | ${totals.high} |`,
    `| Medium findings | ${totals.medium} |`,
    `| Low findings | ${totals.low} |`,
    `| Repositories with a critical finding | ${criticalRepos.length} |`,
    ``,
    `## Completeness × findings`,
    ``,
    `| Category | Cases |`,
    `|---|---:|`,
    ...Object.entries(quadrant).map(([k, v]) => `| ${k} | ${v.length} |`),
    `| **Sum** | **${scanned.length}** |`,
    ``,
    `"Complete" means the documented static analysis met no construct it could not interpret. It is not a security guarantee. "No findings" with "incomplete" is not "clean".`,
    ``,
    `## Findings by rule`,
    ``,
    `| Rule | Count |`,
    `|---|---:|`,
    ...[...ruleCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, v]) => `| \`${k}\` | ${v} |`),
    ``,
    `## Diagnostics by code`,
    ``,
    `| Code | Count |`,
    `|---|---:|`,
    ...[...diagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, v]) => `| \`${k}\` | ${v} |`),
    ``,
    `## Repositories with a critical finding`,
    ``,
    ...(criticalRepos.length
      ? criticalRepos.map(
          (r) =>
            `- \`${r.case_id}\` ${r.repository}: ${r.findings
              .filter((f) => f.severity === "critical")
              .map((f) => f.rule_id.replace("agentci/", ""))
              .join(", ")}`,
        )
      : ["- none"]),
    ``,
    `## Incomplete, no findings (${quadrant["incomplete, no findings"].length})`,
    ``,
    ...(quadrant["incomplete, no findings"].length
      ? quadrant["incomplete, no findings"].map((id) => `- \`${id}\``)
      : ["- none"]),
    ``,
  ];
  if (failed.length) {
    lines.push(
      `## Failed to scan`,
      ``,
      ...failed.map((r) => `- \`${r.case_id}\` ${r.repository}: ${r.failure}`),
      ``,
    );
  }
  return lines.join("\n");
}

function compare(beforePath, afterPath) {
  const before = JSON.parse(readFileSync(beforePath, "utf8"));
  const after = JSON.parse(readFileSync(afterPath, "utf8"));
  const byId = (doc) => new Map(doc.cases.map((c) => [c.case_id, c]));
  const a = byId(before);
  const b = byId(after);
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  const sig = (c) =>
    c && c.scanned
      ? {
          findings: c.findings
            .map(
              (f) =>
                `${f.rule_id}|${f.severity}|${f.file}|${f.job ?? ""}|${f.step ?? ""}`,
            )
            .sort(),
          complete: c.analysis_complete,
          diagnostics: c.diagnostics
            .map((d) => `${d.code}|${d.file}|${d.job ?? ""}`)
            .sort(),
        }
      : { scanned: false };
  let changed = 0;
  console.log(
    `# Behavioral diff\n\nbefore: \`${before.meta.commit.slice(0, 7)}\` → after: \`${after.meta.commit.slice(0, 7)}\`\n`,
  );
  for (const id of ids) {
    const x = sig(a.get(id));
    const y = sig(b.get(id));
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    changed++;
    console.log(`## ${id} (${(b.get(id) ?? a.get(id)).repository})`);
    const removed = (x.findings ?? []).filter(
      (f) => !(y.findings ?? []).includes(f),
    );
    const added = (y.findings ?? []).filter(
      (f) => !(x.findings ?? []).includes(f),
    );
    for (const f of removed) console.log(`- removed: ${f}`);
    for (const f of added) console.log(`- added:   ${f}`);
    if (x.complete !== y.complete)
      console.log(`- analysis_complete: ${x.complete} → ${y.complete}`);
    const dRemoved = (x.diagnostics ?? []).filter(
      (d) => !(y.diagnostics ?? []).includes(d),
    );
    const dAdded = (y.diagnostics ?? []).filter(
      (d) => !(x.diagnostics ?? []).includes(d),
    );
    for (const d of dRemoved) console.log(`- diagnostic removed: ${d}`);
    for (const d of dAdded) console.log(`- diagnostic added:   ${d}`);
    console.log("");
  }
  const tot = (doc) => {
    const t = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const c of doc.cases)
      if (c.scanned) for (const k of Object.keys(t)) t[k] += c.by_severity[k];
    return t;
  };
  console.log(`## Totals\n\n| | before | after |\n|---|---:|---:|`);
  const tb = tot(before),
    ta = tot(after);
  for (const k of Object.keys(tb))
    console.log(`| ${k} | ${tb[k]} | ${ta[k]} |`);
  console.log(`\n${changed} of ${ids.length} cases changed.`);
}

function sortFinding(a, b) {
  return (
    a.file.localeCompare(b.file) ||
    (a.job ?? "").localeCompare(b.job ?? "") ||
    (a.step ?? "").localeCompare(b.step ?? "") ||
    a.rule_id.localeCompare(b.rule_id)
  );
}

function git(cmd) {
  return execFileSync("git", cmd.split(" "), { encoding: "utf8" }).trim();
}
