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
const appNames = Object.keys(manifest).filter((name) =>
  /^app\.[a-f0-9]{64}\.js$/.test(name),
);
assert.equal(appNames.length, 1, "Build must contain one app filename");
const appName = appNames[0];
assert.equal(appName, `app.${manifest[appName]}.js`);
const assets = [
  "index.html",
  "styles.css",
  appName,
  scannerName,
  "THIRD_PARTY_LICENSES.txt",
];
// The nosniff check accepts every JavaScript MIME type in the MIME Sniffing Standard.
const javaScriptMimeTypes = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);
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
      : name === "styles.css"
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
  const contentType = response.headers.get("content-type");
  // shortcut: reject comma-separated values; parse Fetch's header list if production needs them.
  const mimeType = contentType?.includes(",")
    ? "ambiguous"
    : contentType?.split(";", 1)[0].trim().toLowerCase();
  const mimeMatches =
    name === "index.html"
      ? mimeType === "text/html"
      : name === "styles.css"
        ? mimeType === "text/css"
        : name.endsWith(".js")
          ? javaScriptMimeTypes.has(mimeType)
          : true;
  if (name !== "THIRD_PARTY_LICENSES.txt") {
    console.log(
      `${mimeMatches ? "MATCH" : "DRIFT"} MIME ${name}: ${mimeType ?? "missing"}`,
    );
    stale ||= !mimeMatches;
  }
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
    `FAIL: ${base.href} failed asset, header, or MIME checks; do not claim it is current or usable.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${base.href} matches the five served assets, effective headers, and browser-compatible MIME types.`,
  );
}
