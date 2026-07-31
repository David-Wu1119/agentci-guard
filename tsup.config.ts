import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/action.ts"],
  format: ["esm"],
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  target: "node20",
  noExternal: [/.*/],
  banner: {
    js: 'import { createRequire as __agentciCreateRequire } from "node:module"; const require = __agentciCreateRequire(import.meta.url);',
  },
});
