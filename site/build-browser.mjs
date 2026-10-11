import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const browserPath = fileURLToPath(import.meta.resolve("pathe"));

await build({
  entryPoints: ["site/scanner-client.ts"],
  outfile: "site/dist/scanner-browser.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  plugins: [
    {
      name: "browser-scanner-node-boundary",
      setup(build) {
        build.onResolve({ filter: /^node:path$/ }, () => ({
          path: browserPath,
        }));
        build.onResolve({ filter: /^node:fs\/promises$/ }, ({ path }) => ({
          path,
          namespace: "node-only",
        }));
        build.onLoad({ filter: /.*/, namespace: "node-only" }, () => ({
          contents:
            'export default new Proxy({}, { get() { throw new Error("Browser filesystem unavailable"); } });',
          loader: "js",
        }));
      },
    },
  ],
});
