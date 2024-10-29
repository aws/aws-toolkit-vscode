/// <reference types="node" />
import { Writable } from 'stream';
import { CloseEvent, Command, CommandInfo, KillProcess, SpawnCommand } from './command';
import { SuccessCondition } from './completion-listener';
import { FlowController } from './flow-control/flow-controller';
import { Logger } from './logger';
/**
 * A command that is to be passed into `concurrently()`.
 * If value is a string, then that's the command's command line.
 * Fine grained options can be defined by using the object format.
 */
export declare type ConcurrentlyCommandInput = string | Partial<CommandInfo>;
export declare type ConcurrentlyResult = {
    /**
     * All commands created and ran by concurrently.
     */
    commands: Command[];
    /**
     * A promise that resolves when concurrently ran successfully according to the specified
     * success condition, or reject otherwise.
     *
     * Both the resolved and rejected value is the list of all command's close events.
     */
    result: Promise<CloseEvent[]>;
};
export declare type ConcurrentlyOptions = {
    logger?: Logger;
    /**
     * Which stream should the commands output be written to.
     */
    outputStream?: Writable;
    group?: boolean;
    prefixColors?: string[];
    /**
     * Maximum number of commands to run at once.
     *
     * If undefined, then all processes will start in parallel.
     * Setting this value to 1 will achieve sequential running.
     */
    maxProcesses?: number;
    /**
     * Whether commands should be spawned in raw mode.
     * Defaults to false.
     */
    raw?: boolean;
    /**
     * The current working directory of commands which didn't specify one.
     * Defaults to `process.cwd()`.
     */
    cwd?: string;
    /**
     * @see CompletionListener
     */
    successCondition?: SuccessCondition;
    /**
     * Which flow controllers should be applied on commands spawned by concurrently.
     * Defaults to an empty array.
     */
    controllers: FlowController[];
    /**
     * A function that will spawn commands.
     * Defaults to the `spawn-command` module.
     */
    spawn: SpawnCommand;
    /**
     * A function that will kill processes.
     * Defaults to the `tree-kill` module.
     */
    kill: KillProcess;
};
/**
 * Core concurrently functionality -- spawns the given commands concurrently and
 * returns the commands themselves + the result according to the specified success condition.
 *
 * @see CompletionListener
 */
export declare function concurrently(baseCommands: ConcurrentlyCommandInput[], baseOptions?: Partial<ConcurrentlyOptions>): ConcurrentlyResult;
