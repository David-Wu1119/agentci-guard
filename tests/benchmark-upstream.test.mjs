import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  auditUpstreamCase,
  fetchPinnedWorkflow,
} from "../scripts/benchmark/verify-upstream.mjs";

const snapshot = Buffer.from("on: push\n");
const item = {
  case_id: "synthetic-001",
  repository: "owner/repo",
  source_commit: "f".repeat(40),
  source_path: ".github/workflows/ci.yml",
  blob_sha: "a".repeat(40),
  bytes: snapshot.length,
};
const remote = {
  type: "file",
  path: item.source_path,
  sha: item.blob_sha,
  size: item.bytes,
  encoding: "base64",
  content: snapshot.toString("base64"),
};

it("keeps the dated v3 origin receipt aligned with its frozen manifest", () => {
  const manifestBytes = readFileSync(
    new URL("../benchmark/manifest.json", import.meta.url),
  );
  const manifest = JSON.parse(manifestBytes);
  const receipt = JSON.parse(
    readFileSync(
      new URL("../evidence/upstream-v3-2026-10-12.json", import.meta.url),
    ),
  );
  expect(receipt.manifest_sha256).toBe(
    createHash("sha256").update(manifestBytes).digest("hex"),
  );
  expect(receipt.results.map((result) => result.case_id)).toEqual(
    manifest.cases.map((item) => item.case_id),
  );
  expect(receipt.counts).toEqual({
    match: 146,
    mismatch: 0,
    "upstream-unavailable": 6,
    "api-error": 0,
  });
  for (const [status, count] of Object.entries(receipt.counts)) {
    expect(
      receipt.results.filter((result) => result.status === status),
    ).toHaveLength(count);
  }
  expect(
    receipt.results.filter(
      (result) => result.status === "upstream-unavailable",
    ),
  ).toEqual(
    ["ai-008", "ai-009", "ai-018", "ai-021", "ai-040", "control-028"].map(
      (case_id) => ({
        case_id,
        status: "upstream-unavailable",
        reason: "HTTP 404",
      }),
    ),
  );
});

it("requests the exact workflow path at the pinned commit", () => {
  let request;
  const result = fetchPinnedWorkflow(item, (command, args, options) => {
    request = { command, args, options };
    return JSON.stringify(remote);
  });
  expect(result).toEqual(remote);
  expect(request.command).toBe("gh");
  expect(request.args).toContain(
    `repos/${item.repository}/contents/${item.source_path}`,
  );
  expect(request.args).toContain(`ref=${item.source_commit}`);
  expect(request.args.slice(2, 4)).toEqual(["--method", "GET"]);
  expect(request.options.timeout).toBe(30_000);
});

it("distinguishes matching bytes, mismatches, and unavailable upstreams", () => {
  expect(auditUpstreamCase(item, snapshot, () => remote).status).toBe("match");
  for (const [change, reason] of [
    [{ path: ".github/workflows/other.yml" }, "response"],
    [{ sha: "b".repeat(40) }, "blob-sha"],
    [{ size: item.bytes + 1 }, "size"],
    [{ content: Buffer.from("on: nope\n").toString("base64") }, "bytes"],
  ]) {
    expect(
      auditUpstreamCase(item, snapshot, () => ({ ...remote, ...change })),
    ).toEqual({
      case_id: item.case_id,
      status: "mismatch",
      reason,
    });
  }
  expect(
    auditUpstreamCase(item, snapshot, () => {
      throw Object.assign(new Error("Not Found"), { stderr: "HTTP 404" });
    }),
  ).toEqual({
    case_id: item.case_id,
    status: "upstream-unavailable",
    reason: "HTTP 404",
  });
  expect(
    auditUpstreamCase(item, snapshot, () => {
      throw Object.assign(new Error("Forbidden"), { stderr: "HTTP 403" });
    }).status,
  ).toBe("api-error");
  expect(
    auditUpstreamCase(item, snapshot, () => {
      throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    }),
  ).toEqual({
    case_id: item.case_id,
    status: "api-error",
    reason: "transport-or-response",
  });
});
