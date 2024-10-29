/// <reference types="node" />
import { SpawnOptions } from 'child_process';
import supportsColor from 'supports-color';
export declare const getSpawnOpts: ({ colorSupport, cwd, process, raw, env, }: {
    /**
     * What the color support of the spawned processes should be.
     * If set to `false`, then no colors should be output.
     *
     * Defaults to whatever the terminal's stdout support is.
     */
    colorSupport?: Pick<supportsColor.supportsColor.Level, 'level'> | false;
    /**
     * The NodeJS process.
     */
    process?: Pick<NodeJS.Process, 'cwd' | 'platform' | 'env'>;
    /**
     * A custom working directory to spawn processes in.
     * Defaults to `process.cwd()`.
     */
    cwd?: string;
    /**
     * Whether to customize the options for spawning processes in raw mode.
     * Defaults to false.
     */
    raw?: boolean;
    /**
     * Map of custom environment variables to include in the spawn options.
     */
    env?: Record<string, any>;
}) => SpawnOptions;
