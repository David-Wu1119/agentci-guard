#!/usr/bin/env node
type CliIo = {
    log(message: string): void;
    error(message: string): void;
};
/**
 * Run the CLI against a full argv (including the node and script entries) and
 * return the process exit code instead of setting it, so the command surface
 * can be exercised in-process by tests as well as from the bin wrapper.
 */
type CliDeps = {
    /** Injected for tests; defaults to the global fetch. */
    fetch?: typeof fetch;
};
declare function run(argv: string[], io?: CliIo, environment?: Record<string, string | undefined>, deps?: CliDeps): Promise<number>;
/**
 * Whether this module is the script Node was asked to run. Node resolves the
 * main module through symlinks before setting `import.meta.url`, but leaves
 * `process.argv[1]` as given, so the two must be compared after resolving the
 * argv path the same way. Without that, `npm install -g` (whose bin entry is
 * a symlink) and any symlinked directory such as macOS `/tmp` made the CLI
 * load, do nothing, and exit 0.
 */
declare function isInvokedAsScript(moduleUrl: string, argv1: string | undefined): boolean;

export { type CliDeps, type CliIo, isInvokedAsScript, run };
