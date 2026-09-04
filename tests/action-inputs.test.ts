import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAction, type ActionIo } from "../src/action-runner.js";

function captureIo(): ActionIo & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
  };
}

async function sarifPath(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-inputs-"));
  return path.join(directory, "out.sarif");
}

describe("JavaScript Action input handling", () => {
  it("accepts the underscore alias GitHub does not use but local runners do", async () => {
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: await sarifPath(),
        INPUT_FAIL_ON: "none",
      },
      io,
    );
    expect(code).toBe(0);
    expect(io.errors).toEqual([]);
  });

  it("prefers the hyphenated name when both spellings are present", async () => {
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: await sarifPath(),
        "INPUT_FAIL-ON": "critical",
        INPUT_FAIL_ON: "none",
      },
      io,
    );
    expect(code).toBe(2);
  });

  it("rejects an empty sarif input", async () => {
    const io = captureIo();
    expect(
      await runAction(
        { INPUT_PATH: "examples/hardened", INPUT_SARIF: "   " },
        io,
      ),
    ).toBe(1);
    expect(io.errors.join("\n")).toContain("sarif input must not be empty");
  });

  it("rejects an empty path input", async () => {
    const io = captureIo();
    expect(
      await runAction({ INPUT_PATH: "", INPUT_SARIF: await sarifPath() }, io),
    ).toBe(1);
    expect(io.errors.join("\n")).toContain("path input must not be empty");
  });

  it("rejects multi-line inputs that could smuggle workflow commands", async () => {
    const io = captureIo();
    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened\n::set-output name=x::y",
          INPUT_SARIF: await sarifPath(),
        },
        io,
      ),
    ).toBe(1);
    expect(io.errors.join("\n")).toContain("single-line values");
  });

  it("uppercases nothing but the threshold, so case-insensitive fail-on works", async () => {
    const io = captureIo();
    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: await sarifPath(),
          "INPUT_FAIL-ON": "HIGH",
        },
        io,
      ),
    ).toBe(0);
  });
});
