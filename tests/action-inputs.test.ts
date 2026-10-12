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

async function jsonPath(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-inputs-"));
  return path.join(directory, "out.json");
}

describe("JavaScript Action input handling", () => {
  it("accepts the underscore alias GitHub does not use but local runners do", async () => {
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: await sarifPath(),
        INPUT_JSON: await jsonPath(),
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
        INPUT_JSON: await jsonPath(),
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

  it("rejects a whitespace-only JSON path", async () => {
    const io = captureIo();
    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: await sarifPath(),
          INPUT_JSON: "   ",
        },
        io,
      ),
    ).toBe(1);
    expect(io.errors.join("\n")).toContain("json input must not be empty");
  });

  it("rejects JSON and SARIF paths that resolve to the same file", async () => {
    const io = captureIo();
    const output = await sarifPath();
    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: output,
          INPUT_JSON: output,
        },
        io,
      ),
    ).toBe(1);
    expect(io.errors.join("\n")).toContain(
      "json and sarif inputs must refer to different files",
    );
  });

  it("does not follow a JSON symlink and overwrite SARIF", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentci-inputs-"),
    );
    const sarif = path.join(directory, "out.sarif");
    const json = path.join(directory, "out.json");
    await fs.symlink(sarif, json);
    const io = captureIo();

    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: sarif,
          INPUT_JSON: json,
          "INPUT_FAIL-ON": "none",
        },
        io,
      ),
    ).toBe(1);
    expect(JSON.parse(await fs.readFile(sarif, "utf8")).version).toBe("2.1.0");
    expect(io.errors.join("\n")).toContain("out.json");
  });

  it("does not overwrite SARIF through a symlinked parent directory", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentci-inputs-"),
    );
    const realDirectory = path.join(directory, "real");
    const aliasDirectory = path.join(directory, "alias");
    await fs.mkdir(realDirectory);
    await fs.symlink(realDirectory, aliasDirectory, "dir");
    const sarif = path.join(realDirectory, "out.sarif");

    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: sarif,
          INPUT_JSON: path.join(aliasDirectory, "out.sarif"),
          "INPUT_FAIL-ON": "none",
        },
        captureIo(),
      ),
    ).toBe(1);
    expect(JSON.parse(await fs.readFile(sarif, "utf8")).version).toBe("2.1.0");
  });

  it("does not overwrite an existing JSON output", async () => {
    const json = await jsonPath();
    await fs.writeFile(json, "keep this file", "utf8");
    const io = captureIo();

    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: await sarifPath(),
          INPUT_JSON: json,
          "INPUT_FAIL-ON": "none",
        },
        io,
      ),
    ).toBe(1);
    expect(await fs.readFile(json, "utf8")).toBe("keep this file");
  });

  it("rejects a multi-line JSON path", async () => {
    const io = captureIo();
    expect(
      await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: await sarifPath(),
          INPUT_JSON: "result.json\n::set-output name=x::y",
        },
        io,
      ),
    ).toBe(1);
    expect(io.errors.join("\n")).toContain("single-line values");
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
          INPUT_JSON: await jsonPath(),
          "INPUT_FAIL-ON": "HIGH",
        },
        io,
      ),
    ).toBe(0);
  });
});
