import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

async function withConfig(
  contents: unknown,
  filename = "agentci.config.json",
): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-config-"));
  await fs.writeFile(
    path.join(directory, filename),
    JSON.stringify(contents),
    "utf8",
  );
  return directory;
}

describe("loadConfig", () => {
  it("returns an empty config when no file is present", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentci-config-"),
    );
    expect(await loadConfig(directory)).toEqual({
      ignore: [],
      ignorePaths: [],
    });
  });

  it("discovers the .agentcirc.json fallback name", async () => {
    const directory = await withConfig(
      { ignore: ["agentci/unpinned-ai-action"] },
      ".agentcirc.json",
    );
    expect((await loadConfig(directory)).ignore).toEqual([
      "agentci/unpinned-ai-action",
    ]);
  });

  it("fails loudly when an explicit config path cannot be read", async () => {
    await expect(
      loadConfig(".", "/definitely/missing/agentci.config.json"),
    ).rejects.toThrow(/Unable to read config file/);
  });

  it("coerces ignore lists to strings and drops non-arrays", async () => {
    const directory = await withConfig({
      ignore: ["a", 2],
      ignorePaths: "not-an-array",
    });
    expect(await loadConfig(directory)).toEqual({
      ignore: ["a", "2"],
      ignorePaths: [],
      defaultPermissions: undefined,
    });
  });

  it("accepts the four keyword permission defaults", async () => {
    for (const keyword of ["unknown", "none", "read-all", "write-all"]) {
      const directory = await withConfig({ defaultPermissions: keyword });
      expect((await loadConfig(directory)).defaultPermissions).toBe(keyword);
    }
  });

  it("accepts and normalizes a permission map", async () => {
    const directory = await withConfig({
      defaultPermissions: { contents: "read", "pull-requests": "write" },
    });
    expect((await loadConfig(directory)).defaultPermissions).toEqual({
      contents: "read",
      "pull-requests": "write",
    });
  });

  it("rejects a permission default that is neither keyword nor map", async () => {
    for (const bad of ["everything", 7, ["read"], null]) {
      const directory = await withConfig({ defaultPermissions: bad });
      await expect(loadConfig(directory)).rejects.toThrow(
        /defaultPermissions must be unknown, none, read-all, write-all, or a permission map/,
      );
    }
  });

  it("rejects an unknown scope level inside a permission map", async () => {
    const directory = await withConfig({
      defaultPermissions: { contents: "admin" },
    });
    await expect(loadConfig(directory)).rejects.toThrow(
      /defaultPermissions\.contents must be none, read, or write/,
    );
  });
});
