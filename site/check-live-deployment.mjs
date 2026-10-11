import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const base = new URL(process.argv[2] ?? "https://cryptoaxiom.net/");
assert.ok(["http:", "https:"].includes(base.protocol));
assert.ok(base.pathname.endsWith("/") && !base.search && !base.hash);
const manifest = JSON.parse(
  await fs.readFile(new URL("./BUILD_MANIFEST.json", import.meta.url), "utf8"),
);
const scannerNames = Object.keys(manifest).filter((name) =>
  /^scanner-browser\.[a-f0-9]{64}\.js$/.test(name),
);
assert.equal(scannerNames.length, 1, "Build must contain one scanner filename");
const scannerName = scannerNames[0];
assert.equal(scannerName, `scanner-browser.${manifest[scannerName]}.js`);
const assets = [
  "index.html",
  "styles.css",
  "app.js",
  scannerName,
  "THIRD_PARTY_LICENSES.txt",
];
assert.deepEqual(
  Object.keys(manifest).sort(),
  [...assets, "_headers"].sort(),
  "Build manifest must contain exactly the six allowlisted assets",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const name of [...assets, "_headers"]) {
  assert.equal(
    digest(await fs.readFile(new URL(`./dist/${name}`, import.meta.url))),
    manifest[name],
    `Local ${name} differs from the build manifest; run pnpm site:check`,
  );
}

let stale = false;
for (const name of assets) {
  const assetUrl =
    name === "index.html"
      ? "."
      : ["styles.css", "app.js"].includes(name)
        ? `${name}?v=${manifest[name]}`
        : name;
  const response = await fetch(new URL(assetUrl, base), {
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `${name}: HTTP ${response.status}`);
  assert.equal(
    new URL(response.url).origin,
    base.origin,
    `${name}: redirected away`,
  );
  assert.ok(response.body, `${name}: empty response`);
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    assert.ok(bytes <= 2_000_000, `${name}: response exceeds 2 MB`);
    hash.update(chunk);
  }
  const live = hash.digest("hex");
  const matches = live === manifest[name];
  console.log(
    `${matches ? "MATCH" : "DRIFT"} ${name} local=${manifest[name]} live=${live}`,
  );
  stale ||= !matches;

  if (name === "index.html") {
    const headerFile = await fs.readFile(
      new URL("./dist/_headers", import.meta.url),
      "utf8",
    );
    const directives = headerFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line !== "/*");
    assert.ok(directives.length > 0, "No effective response headers to check");
    for (const line of directives) {
      const separator = line.indexOf(":");
      assert.ok(separator > 0, `Invalid _headers directive: ${line}`);
      const header = line.slice(0, separator);
      const expected = line.slice(separator + 1).trim();
      const actual = response.headers.get(header);
      const headerMatches = actual === expected;
      console.log(`${headerMatches ? "MATCH" : "DRIFT"} header ${header}`);
      stale ||= !headerMatches;
    }
  }
}

// shortcut: Cloudflare consumes _headers instead of serving it; compare its effective response headers.
if (stale) {
  console.error(
    `FAIL: ${base.href} differs from the local build; do not claim it is current.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${base.href} matches the five served assets and effective headers.`,
  );
}
