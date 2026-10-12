import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("rejects incompatible served HTML, script, and stylesheet MIME types", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentci-site-live-"));
  const site = path.join(root, "site");
  const dist = path.join(site, "dist");
  await mkdir(dist, { recursive: true });
  await copyFile(
    new URL("../site/check-live-deployment.mjs", import.meta.url),
    path.join(site, "check-live-deployment.mjs"),
  );

  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const app = "window.app = true;";
  const scanner = "window.scanner = true;";
  const appName = `app.${hash(app)}.js`;
  const scannerName = `scanner-browser.${hash(scanner)}.js`;
  const files = new Map([
    [
      "index.html",
      `<link rel="stylesheet" href="styles.css"><script src="${scannerName}"></script><script src="${appName}"></script>`,
    ],
    ["styles.css", "body { color: black; }"],
    [appName, app],
    [scannerName, scanner],
    ["_headers", "/*\n  X-Content-Type-Options: nosniff\n"],
    ["THIRD_PARTY_LICENSES.txt", "test notices"],
  ]);
  const manifest: Record<string, string> = {};
  for (const [name, content] of files) {
    await writeFile(path.join(dist, name), content);
    manifest[name] = hash(content);
  }
  await writeFile(
    path.join(site, "BUILD_MANIFEST.json"),
    JSON.stringify(manifest),
  );

  let wrongMime = "";
  let wrongValue = "text/plain";
  const server = createServer(async (request, response) => {
    const name =
      new URL(request.url ?? "/", "http://localhost").pathname.slice(1) ||
      "index.html";
    if (!Object.hasOwn(manifest, name) || name === "_headers") {
      response.writeHead(404).end();
      return;
    }
    const mime =
      name === "index.html"
        ? "text/html"
        : name === "styles.css"
          ? "text/css"
          : name.endsWith(".js")
            ? name === appName
              ? "application/javascript"
              : "text/javascript"
            : "text/plain";
    response.writeHead(200, {
      "Content-Type":
        wrongMime === name ? wrongValue : `${mime}; charset=utf-8`,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(await readFile(path.join(dist, name)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No local port");
    const base = `http://127.0.0.1:${address.port}/`;
    const runCheck = () =>
      new Promise<{ code: number | null; output: string }>(
        (resolve, reject) => {
          const child = spawn(process.execPath, [
            path.join(site, "check-live-deployment.mjs"),
            base,
          ]);
          let output = "";
          child.stdout.on("data", (chunk) => (output += chunk));
          child.stderr.on("data", (chunk) => (output += chunk));
          child.on("error", reject);
          child.on("close", (code) => resolve({ code, output }));
        },
      );

    expect((await runCheck()).code).toBe(0);
    for (const name of ["index.html", appName, scannerName, "styles.css"]) {
      wrongMime = name;
      const result = await runCheck();
      expect(result.code).toBe(1);
      expect(result.output).toContain(`DRIFT MIME ${name}: text/plain`);
    }
    wrongMime = appName;
    wrongValue = "text/javascript; charset=utf-8, text/plain";
    const ambiguous = await runCheck();
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.output).toContain(`DRIFT MIME ${appName}: ambiguous`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
