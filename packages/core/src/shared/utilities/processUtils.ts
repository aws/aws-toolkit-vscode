/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as proc from 'child_process' // eslint-disable-line no-restricted-imports
import * as crossSpawn from 'cross-spawn'
import * as logger from '../logger/logger'
import { Timeout, CancellationError, waitUntil } from './timeoutUtils'
import { PollingSet } from './pollingSet'

export interface RunParameterContext {
    /** Reports an error parsed from the stdin/stdout streams. */
    reportError(err: string | Error): void
    /** Attempts to stop the running process. See {@link ChildProcess.stop}. */
    stop(force?: boolean, signal?: string): void
    /** Send string to stdin */
    send(text: string): Promise<void>
    /** The active `Timeout` object (if applicable). */
    readonly timeout?: Timeout
    /** The logger being used by the process. */
    readonly logger: logger.Logger
}

export interface ChildProcessOptions {
    /** Sets the logging behavior. (default: 'yes') */
    logging?: 'yes' | 'no' | 'noparams'
    /** Controls whether stdout/stderr is collected and returned in the `ChildProcessResult`. (default: true) */
    collect?: boolean
    /** Wait until streams close to resolve the process result. (default: true) */
    waitForStreams?: boolean
    /** Forcefully kill the process on an error. (default: false) */
    useForceStop?: boolean
    /** Rejects the Promise on any error. Can also use a callback for custom errors. (default: false) */
    rejectOnError?: boolean | ((error: Error) => Error)
    /** Rejects the Promise on non-zero exit codes. Can also use a callback for custom errors. (default: false) */
    rejectOnErrorCode?: boolean | ((code: number) => Error)
    /** A `Timeout` token. The running process will be terminated on expiration or cancellation. */
    timeout?: Timeout
    /** Options sent to the `spawn` command. This is merged in with the base options if they exist. */
    spawnOptions?: proc.SpawnOptions
    /** Callback for intercepting text from the stdout stream. */
    onStdout?: (text: string, context: RunParameterContext) => void
    /** Callback for intercepting text from the stderr stream. */
    onStderr?: (text: string, context: RunParameterContext) => void
}

export interface ChildProcessRunOptions extends Omit<ChildProcessOptions, 'logging'> {
    /** Arguments applied in addition to the ones used in construction. */
    extraArgs?: string[]
}

export interface ChildProcessResult {
    exitCode: number
    error: Error | undefined
    /** All output emitted by the process, if it was started with `collect=true`, else empty. */
    stdout: string
    /** All stderr data emitted by the process, if it was started with `collect=true`, else empty. */
    stderr: string
    signal?: string
}

export const eof = Symbol('EOF')

export interface ProcessStats {
    memory: number
    cpu: number
}
export class ChildProcessTracker {
    static readonly pollingInterval: number = 10000 // Check usage every 10 seconds
    static readonly thresholds: ProcessStats = {
        memory: 100 * 1024 * 1024, // 100 MB
        cpu: 50,
    }
    static readonly logger = logger.getLogger('childProcess')
    #processByPid: Map<number, ChildProcess> = new Map<number, ChildProcess>()
    #pids: PollingSet<number>

    public constructor() {
        this.#pids = new PollingSet(ChildProcessTracker.pollingInterval, () => this.monitor())
    }

    private cleanUp() {
        const terminatedProcesses = Array.from(this.#pids.values()).filter(
            (pid: number) => this.#processByPid.get(pid)?.stopped
        )
        for (const pid of terminatedProcesses) {
            this.delete(pid)
        }
    }

    private async monitor() {
        this.cleanUp()
        ChildProcessTracker.logger.debug(`Active running processes size: ${this.#pids.size}`)

        for (const pid of this.#pids.values()) {
            await this.checkProcessUsage(pid)
        }
    }

    private async checkProcessUsage(pid: number): Promise<void> {
        if (!this.#pids.has(pid)) {
            ChildProcessTracker.logger.warn(`Missing process with id ${pid}`)
            return
        }
        const stats = this.getUsage(pid)
        if (stats) {
            ChildProcessTracker.logger.debug(`Process ${pid} usage: %O`, stats)
            if (stats.memory > ChildProcessTracker.thresholds.memory) {
                ChildProcessTracker.logger.warn(`Process ${pid} exceeded memory threshold: ${stats.memory}`)
            }
            if (stats.cpu > ChildProcessTracker.thresholds.cpu) {
                ChildProcessTracker.logger.warn(`Process ${pid} exceeded cpu threshold: ${stats.cpu}`)
            }
        }
    }

    public add(childProcess: ChildProcess) {
        const pid = childProcess.pid()
        this.#processByPid.set(pid, childProcess)
        this.#pids.add(pid)
    }

    public delete(childProcessId: number) {
        this.#processByPid.delete(childProcessId)
        this.#pids.delete(childProcessId)
    }

    public get size() {
        return this.#pids.size
    }

    public has(childProcess: ChildProcess) {
        return this.#pids.has(childProcess.pid())
    }

    public clear() {
        for (const childProcess of this.#processByPid.values()) {
            childProcess.stop(true)
        }
        this.#pids.clear()
        this.#processByPid.clear()
    }

    public getUsage(pid: number): ProcessStats {
        try {
            // isWin() leads to circular dependency.
            return process.platform === 'win32' ? getWindowsUsage() : getUnixUsage()
        } catch (e) {
            ChildProcessTracker.logger.warn(`Failed to get process stats for ${pid}: ${e}`)
            return { cpu: 0, memory: 0 }
        }

        function getWindowsUsage() {
            const cpuOutput = proc
                .execFileSync('wmic', [
                    'path',
                    'Win32_PerfFormattedData_PerfProc_Process',
                    'where',
                    `IDProcess=${pid}`,
                    'get',
                    'PercentProcessorTime',
                ])
                .toString()
            const memOutput = proc
                .execFileSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'WorkingSetSize'])
                .toString()

            const cpuPercentage = parseFloat(cpuOutput.split('\n')[1])
            const memoryBytes = parseInt(memOutput.split('\n')[1]) * 1024

            return {
                cpu: isNaN(cpuPercentage) ? 0 : cpuPercentage,
                memory: memoryBytes,
            }
        }

        function getUnixUsage() {
            const cpuMemOutput = proc.execFileSync('ps', ['-p', pid.toString(), '-o', '%cpu,%mem']).toString()
            const rssOutput = proc.execFileSync('ps', ['-p', pid.toString(), '-o', 'rss']).toString()

            const cpuMemLines = cpuMemOutput.split('\n')[1].trim().split(/\s+/)
            const cpuPercentage = parseFloat(cpuMemLines[0])
            const memoryBytes = parseInt(rssOutput.split('\n')[1]) * 1024

            return {
                cpu: isNaN(cpuPercentage) ? 0 : cpuPercentage,
                memory: memoryBytes,
            }
        }
    }
}

/**
 * Convenience class to manage a child process
 * To use:
 * - instantiate
 * - call and await run to get the results (pass or fail)
 */
export class ChildProcess {
    static #runningProcesses = new ChildProcessTracker()
    static stopTimeout = 3000
    #childProcess: proc.ChildProcess | undefined
    #processErrors: Error[] = []
    #processResult: ChildProcessResult | undefined
    #log: logger.Logger

    /** Collects stdout data if the process was started with `collect=true`. */
    #stdoutChunks: string[] = []
    /** Collects stderr data if the process was started with `collect=true`. */
    #stderrChunks: string[] = []

    #command: string
    #args: string[]
    #baseOptions: ChildProcessOptions

    #makeResult(code: number, signal?: NodeJS.Signals): ChildProcessResult {
        return {
            exitCode: code,
            stdout: this.#stdoutChunks.join('').trim(),
            stderr: this.#stderrChunks.join('').trim(),
            error: this.#processErrors[0], // Only use the first since that one usually cascades.
            signal,
        }
    }

    public constructor(command: string, args: string[] = [], baseOptions: ChildProcessOptions = {}) {
        this.#command = command
        this.#args = args
        this.#baseOptions = baseOptions
        // TODO: allow caller to use the various loggers instead of just the single one
        this.#log = baseOptions.logging !== 'no' ? logger.getLogger() : logger.getNullLogger()
    }
    public static async run(
        command: string,
        args: string[] = [],
        options?: ChildProcessOptions
    ): Promise<ChildProcessResult> {
        return await new ChildProcess(command, args, options).run()
    }

    // Inspired by 'got'
    /**
     * Creates a one-off {@link ChildProcess} class that always uses the specified options.
     */
    public static extend(options: ChildProcessOptions) {
        return class extends this {
            public constructor(command: string, args: string[] = []) {
                super(command, args, options)
            }
        }
    }

    /**
     * Runs the child process. Options passed here are merged with the options passed in during construction.
     * Priority is given to `run` options, overriding the previous value.
     */
    public async run(params: ChildProcessRunOptions = {}): Promise<ChildProcessResult> {
        if (this.#childProcess) {
            throw new Error('process already started')
        }

        const options = {
            collect: true,
            waitForStreams: true,
            ...this.#baseOptions,
            ...params,
            spawnOptions: { ...this.#baseOptions.spawnOptions, ...params.spawnOptions },
        }

        const { rejectOnError, rejectOnErrorCode, timeout } = options
        const args = this.#args.concat(options.extraArgs ?? [])

        const debugDetail = this.#log.logLevelEnabled('debug')
            ? ` (running processes: ${ChildProcess.#runningProcesses.size})`
            : ''
        this.#log.info(`Command: ${this.toString(options.logging === 'noparams')}${debugDetail}`)

        const cleanup = () => {
            this.#childProcess?.stdout?.removeAllListeners()
            this.#childProcess?.stderr?.removeAllListeners()
        }

        return new Promise<ChildProcessResult>((resolve, reject) => {
            const errorHandler = (error: Error, force = options.useForceStop) => {
                this.#processErrors.push(error)
                if (!this.stopped) {
                    this.stop(force)
                }
                if (rejectOnError) {
                    if (typeof rejectOnError === 'function') {
                        reject(rejectOnError(error))
                    } else {
                        reject(error)
                    }
                }
            }

            const paramsContext: RunParameterContext = {
                timeout,
                logger: this.#log,
                stop: this.stop.bind(this),
                send: this.send.bind(this),
                reportError: (err) => errorHandler(err instanceof Error ? err : new Error(err)),
            }

            if (timeout && timeout?.completed) {
                throw new Error('Timeout token was already completed.')
            }

            // Async.
            // See also crossSpawn.spawnSync().
            // Arguments are forwarded[1] to node `child_process` module, see its documentation[2].
            // [1] https://github.com/moxystudio/node-cross-spawn/blob/master/index.js
            // [2] https://nodejs.org/api/child_process.html
            try {
                this.#childProcess = crossSpawn.spawn(this.#command, args, options.spawnOptions)
                this.#registerLifecycleListeners(this.#childProcess, errorHandler, options)
            } catch (err) {
                return reject(err)
            }

            // Emitted whenever:
            //  1. Process could not be spawned, or
            //  2. Process could not be killed, or
            //  3. Sending a message to the child process failed.
            // https://nodejs.org/api/child_process.html#child_process_class_childprocess
            // We also register error event handlers on the output/error streams in case a lower level library fails
            this.#childProcess.on('error', errorHandler)
            this.#childProcess.stdout?.on('error', errorHandler)
            this.#childProcess.stderr?.on('error', errorHandler)

            this.#childProcess.stdout?.on('data', (data: { toString(): string }) => {
                if (options.collect) {
                    this.#stdoutChunks.push(data.toString())
                }

                options.onStdout?.(data.toString(), paramsContext)
            })

            this.#childProcess.stderr?.on('data', (data: { toString(): string }) => {
                if (options.collect) {
                    this.#stderrChunks.push(data.toString())
                }

                options.onStderr?.(data.toString(), paramsContext)
            })

            // Emitted when streams are closed.
            // This will not be fired if `waitForStreams` is false
            this.#childProcess.once('close', (code, signal) => {
                this.#processResult = this.#makeResult(code ?? -1, signal ?? undefined)
                resolve(this.#processResult)
            })

            // Emitted when process exits or terminates.
            // https://nodejs.org/api/child_process.html#child_process_class_childprocess
            // - If the process exited, `code` is the final exit code of the process, else null.
            // - If the process terminated because of a signal, `signal` is the name of the signal, else null.
            // - One of `code` or `signal` will always be non-null.
            this.#childProcess.once('exit', (code, signal) => {
                this.#processResult = this.#makeResult(
                    typeof code === 'number' ? code : -1,
                    typeof signal === 'string' ? signal : undefined
                )
                if (code && rejectOnErrorCode) {
                    if (typeof rejectOnErrorCode === 'function') {
                        reject(rejectOnErrorCode(code))
                    } else {
                        reject(new Error(`Command exited with non-zero code: ${code}`))
                    }
                }
                if (options.waitForStreams === false) {
                    resolve(this.#processResult)
                }
            })
        }).finally(() => cleanup())
    }

    /**
     * Gets the `run()` result after the child process has finished.
     *
     * stdout/stderr will be empty unless the process was started with `collect=true`.
     *
     * @returns `run()` result, or undefined if the process has not yet started or is still running.
     */
    public result(): ChildProcessResult | undefined {
        return this.#processResult
    }

    public pid(): number {
        return this.#childProcess?.pid ?? -1
    }

    public exitCode(): number {
        return this.#childProcess?.exitCode ?? -1
    }

    /**
     * Stops the process.
     *
     * SIGTERM won't kill a terminal process, use SIGHUP instead.
     *
     * @param force  Tries SIGKILL if the process is not stopped after a few seconds.
     * @param signal  Signal to send, defaults to SIGTERM (node default).
     *
     */
    public stop(force: boolean = false, signal?: NodeJS.Signals): void {
        const child = this.#childProcess
        if (!child || child.stdin?.destroyed) {
            return
        }
        const command = this.#command
        const pid = this.pid()
        if (!this.stopped) {
            child.kill(signal)

            if (force === true) {
                waitUntil(async () => this.stopped, { timeout: ChildProcess.stopTimeout, interval: 200, truthy: true })
                    .then((stopped) => {
                        if (!stopped) {
                            child.kill('SIGKILL')
                        }
                    })
                    .catch((e) => {
                        this.#log.warn(`stop(): SIGKILL failed: pid=${pid} command=${command}`)
                    })
            }
        } else {
            throw new Error('Attempting to kill a process that has already been killed')
        }
    }

    #registerLifecycleListeners(
        process: proc.ChildProcess,
        errorHandler: (error: Error, forceStop?: boolean) => void,
        options?: ChildProcessOptions
    ): void {
        const pid = process.pid
        if (pid === undefined) {
            return
        }
        ChildProcess.#runningProcesses.add(this)

        const timeoutListener = options?.timeout?.token.onCancellationRequested(({ agent }) => {
            const message = agent === 'user' ? 'Cancelled: ' : 'Timed out: '
            this.#log.verbose(`${message}${this.toString(options?.logging === 'noparams')}`)
            errorHandler(new CancellationError(agent), true)
        })

        const dispose = () => {
            timeoutListener?.dispose()
            ChildProcess.#runningProcesses.delete(this.pid())
        }

        process.on('exit', dispose)
        process.on('error', dispose)
    }

    /**
     * Sends data to the process
     *
     * This throws if the process hasn't started or if the write fails.
     */
    public async send(input: string | Buffer | typeof eof) {
        if (this.#childProcess === undefined) {
            throw new Error('Cannot write to non-existent process')
        }

        const stdin = this.#childProcess.stdin
        if (!stdin) {
            throw new Error('Cannot write to non-existent stdin')
        }

        if (input === eof) {
            return new Promise<void>((resolve) => stdin.end('', resolve))
        }

        return new Promise<void>((resolve, reject) => stdin.write(input, (e) => (e ? reject(e) : resolve())))
    }

    /**
     * Returns true if the process has ended, or false if the process was not
     * started or is still running.
     *
     * "Ended" means any of:
     * - error prevented start, or
     * - streams closed, or
     * - process exited, or
     * - exit-code was set.
     */
    public get stopped(): boolean {
        if (!this.#childProcess) {
            return false // Not started yet.
        }
        return !!this.#processResult
    }

    /**
     * Gets a string representation of the process invocation.
     *
     * @param noparams Omit parameters in the result (to protect sensitive info).
     */
    public toString(noparams = false): string {
        const pid = this.pid() > 0 ? `PID ${this.pid()}:` : '(not started)'
        return `${pid} [${this.#command} ${noparams ? '...' : this.#args.join(' ')}]`
    }
}
