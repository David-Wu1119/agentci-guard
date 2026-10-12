#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export function fetchPinnedWorkflow(item, run = execFileSync) {
  // GitHub Contents API: https://docs.github.com/en/rest/repos/contents#get-repository-content
  return JSON.parse(
    run(
      "gh",
      [
        "api",
        `repos/${item.repository}/contents/${item.source_path}`,
        "--method",
        "GET",
        "-f",
        `ref=${item.source_commit}`,
        "-H",
        "Accept: application/vnd.github+json",
      ],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
    ),
  );
}

export function auditUpstreamCase(item, snapshot, fetch = fetchPinnedWorkflow) {
  let remote;
  try {
    remote = fetch(item);
  } catch (error) {
    const status = /HTTP (\d{3})/.exec(
      String(error?.stderr ?? error?.message ?? error),
    )?.[1];
    return {
      case_id: item.case_id,
      status: status === "404" ? "upstream-unavailable" : "api-error",
      reason: status ? `HTTP ${status}` : "transport-or-response",
    };
  }
  if (
    remote?.type !== "file" ||
    remote.path !== item.source_path ||
    remote.encoding !== "base64" ||
    typeof remote.content !== "string"
  ) {
    return { case_id: item.case_id, status: "mismatch", reason: "response" };
  }
  const bytes = Buffer.from(remote.content.replace(/\s/g, ""), "base64");
  if (remote.sha !== item.blob_sha) {
    return { case_id: item.case_id, status: "mismatch", reason: "blob-sha" };
  }
  if (remote.size !== item.bytes || bytes.length !== item.bytes) {
    return { case_id: item.case_id, status: "mismatch", reason: "size" };
  }
  if (!bytes.equals(snapshot)) {
    return { case_id: item.case_id, status: "mismatch", reason: "bytes" };
  }
  return { case_id: item.case_id, status: "match" };
}

function main() {
  execFileSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts/benchmark/verify-snapshot.mjs")],
    { cwd: repositoryRoot, stdio: ["ignore", "ignore", "inherit"] },
  );
  const manifestBytes = fs.readFileSync(
    path.join(repositoryRoot, "benchmark/manifest.json"),
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const results = manifest.cases.map((item) =>
    auditUpstreamCase(
      item,
      fs.readFileSync(path.join(repositoryRoot, item.snapshot_path)),
    ),
  );
  const counts = Object.fromEntries(
    ["match", "mismatch", "upstream-unavailable", "api-error"].map((status) => [
      status,
      results.filter((result) => result.status === status).length,
    ]),
  );
  console.log(
    JSON.stringify(
      {
        benchmark_id: manifest.benchmark_id,
        manifest_sha256: createHash("sha256")
          .update(manifestBytes)
          .digest("hex"),
        checked_at: new Date().toISOString(),
        counts,
        results,
      },
      null,
      2,
    ),
  );
  if (counts.match !== manifest.cases.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
