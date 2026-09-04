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
declare function run(argv: string[], io?: CliIo, environment?: Record<string, string | undefined>): Promise<number>;

export { type CliIo, run };
