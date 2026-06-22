import { describe, expect, it } from "vitest";
import { formatGithubOutputs, scanRepository } from "../src/index.js";

describe("formatGithubOutputs", () => {
  it("emits GITHUB_OUTPUT lines with counts and sarif path", async () => {
    const result = await scanRepository("tests/fixtures");
    const out = formatGithubOutputs(result, "agentci-results.sarif");
    const lines = out.trimEnd().split("\n");
    const map = Object.fromEntries(
      lines.map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
    );

    expect(Number(map.findings)).toBe(result.findings.length);
    expect(Number(map.critical)).toBe(result.summary.critical);
    expect(Number(map.high)).toBe(result.summary.high);
    expect(map["sarif-path"]).toBe("agentci-results.sarif");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("leaves sarif-path empty when none was written", async () => {
    const result = await scanRepository("tests/fixtures/benign");
    const out = formatGithubOutputs(result);
    expect(out).toContain("sarif-path=\n");
    expect(out).toContain("findings=0");
  });
});
