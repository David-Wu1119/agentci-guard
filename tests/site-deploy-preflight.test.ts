import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const modulePath = new URL("../site/deploy-preflight.mjs", import.meta.url)
  .href;
const assets = [
  "index.html",
  "styles.css",
  "app.js",
  "_headers",
  "THIRD_PARTY_LICENSES.txt",
];
const sha = "a".repeat(40);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "agentci-site-preflight-"));
  const dist = path.join(root, "site", "dist");
  await mkdir(dist, { recursive: true });
  const manifest: Record<string, string> = {};
  for (const asset of assets) {
    const content = `test ${asset}`;
    await writeFile(path.join(dist, asset), content);
    manifest[asset] = createHash("sha256").update(content).digest("hex");
  }
  const scannerContent = "test scanner-browser.js";
  const scannerHash = createHash("sha256").update(scannerContent).digest("hex");
  const scannerName = `scanner-browser.${scannerHash}.js`;
  await writeFile(path.join(dist, scannerName), scannerContent);
  manifest[scannerName] = scannerHash;
  await writeFile(
    path.join(root, "site", "BUILD_MANIFEST.json"),
    `${JSON.stringify(manifest)}\n`,
  );
  return { root, manifest };
}

describe("site deployment preflight", () => {
  it("accepts only a clean public commit with a freshly built matching manifest", async () => {
    const { root, manifest } = await fixture();
    let builds = 0;
    try {
      const { checkDeployReadiness } = await import(modulePath);
      const result = await checkDeployReadiness({
        root,
        git: (...args: string[]) => (args[0] === "status" ? "" : sha),
        build: () => {
          builds++;
        },
        request: async (url: string) => {
          expect(url).toBe(
            "https://api.github.com/repos/David-Wu1119/agentci-guard/git/ref/heads/main",
          );
          return {
            ok: true,
            status: 200,
            json: async () => ({ object: { sha } }),
          };
        },
      });
      expect(result).toEqual({ sha, manifest });
      expect(builds).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects source not published on the canonical main branch before building", async () => {
    const { root } = await fixture();
    let builds = 0;
    try {
      const { checkDeployReadiness } = await import(modulePath);
      await expect(
        checkDeployReadiness({
          root,
          git: (...args: string[]) => (args[0] === "status" ? "" : sha),
          build: () => {
            builds++;
          },
          request: async () => ({ ok: false, status: 404 }),
        }),
      ).rejects.toThrow(/public.*main|main.*public/i);
      expect(builds).toBe(0);
      await expect(
        checkDeployReadiness({
          root,
          git: (...args: string[]) => (args[0] === "status" ? "" : sha),
          build: () => {
            builds++;
          },
          request: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ object: { sha: "b".repeat(40) } }),
          }),
        }),
      ).rejects.toThrow(/public.*main|main.*public/i);
      expect(builds).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a build that changed tracked files or has stale asset bytes", async () => {
    const { root } = await fixture();
    try {
      const { checkDeployReadiness } = await import(modulePath);
      const common = {
        root,
        build: () => {},
        request: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha } }),
        }),
      };
      await expect(
        checkDeployReadiness({
          ...common,
          git: (...args: string[]) =>
            args[0] === "status" ? " M README.md" : sha,
        }),
      ).rejects.toThrow(/clean/i);
      let statusCalls = 0;
      await expect(
        checkDeployReadiness({
          ...common,
          git: (...args: string[]) =>
            args[0] === "status" ? (++statusCalls === 1 ? "" : " M dist") : sha,
        }),
      ).rejects.toThrow(/clean/i);
      let headCalls = 0;
      await expect(
        checkDeployReadiness({
          ...common,
          git: (...args: string[]) =>
            args[0] === "status"
              ? ""
              : ++headCalls === 1
                ? sha
                : "b".repeat(40),
        }),
      ).rejects.toThrow(/HEAD.*changed|changed.*HEAD/i);
      await writeFile(path.join(root, "site", "dist", "app.js"), "stale");
      await expect(
        checkDeployReadiness({
          ...common,
          git: (...args: string[]) => (args[0] === "status" ? "" : sha),
        }),
      ).rejects.toThrow(/app\.js/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a scanner filename that does not match its bytes", async () => {
    const { root, manifest } = await fixture();
    try {
      const { checkDeployReadiness } = await import(modulePath);
      const scannerName = Object.keys(manifest).find((name) =>
        name.startsWith("scanner-browser."),
      )!;
      const wrongName = `scanner-browser.${"b".repeat(64)}.js`;
      await writeFile(
        path.join(root, "site", "dist", wrongName),
        "test scanner-browser.js",
      );
      delete manifest[scannerName];
      manifest[wrongName] = createHash("sha256")
        .update("test scanner-browser.js")
        .digest("hex");
      await writeFile(
        path.join(root, "site", "BUILD_MANIFEST.json"),
        `${JSON.stringify(manifest)}\n`,
      );
      await expect(
        checkDeployReadiness({
          root,
          git: (...args: string[]) => (args[0] === "status" ? "" : sha),
          build: () => {},
          request: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ object: { sha } }),
          }),
        }),
      ).rejects.toThrow(/scanner.*filename|filename.*scanner/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
