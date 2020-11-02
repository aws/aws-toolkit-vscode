/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as crossSpawn from 'cross-spawn'
import { getLogger } from '../logger'
import { waitUntil } from './timeoutUtils'

export interface ChildProcessStartArguments {
    /** Controls whether stdout/stderr is collected and returned in the `ChildProcessResult`. */
    collect?: boolean
    onStdout?(text: string): void
    onStderr?(text: string): void
    onError?(error: Error): void
    onClose?(code: number, signal: string): void
    onExit?(code: number | null, signal: string | null): void
}

export interface ChildProcessResult {
    exitCode: number
    error: Error | undefined
    /** All output emitted by the process, if it was started with `collect=true`, else empty. */
    stdout: string
    /** All stderr data emitted by the process, if it was started with `collect=true`, else empty. */
    stderr: string
}

/**
 * Convenience class to manage a child process
 * To use:
 * - instantiate
 * - call and await run to get the results (pass or fail)
 */
export class ChildProcess {
    private readonly args: string[]
    private childProcess: child_process.ChildProcess | undefined
    private processError: Error | undefined
    private processResult: ChildProcessResult | undefined

    /** Collects stdout data if the process was started with `collect=true`. */
    private stdoutChunks: string[] = []
    /** Collects stderr data if the process was started with `collect=true`. */
    private stderrChunks: string[] = []

    private makeResult(code: number): ChildProcessResult {
        return {
            exitCode: code,
            stdout: this.stdoutChunks.join().trim(),
            stderr: this.stderrChunks.join().trim(),
            error: this.processError,
        }
    }

    public constructor(
        private readonly command: string,
        private readonly options?: child_process.SpawnOptions,
        ...args: string[]
    ) {
        this.args = args
    }

    /**
     * Calls `start()` with default listeners that resolve()/reject() on process end.
     */
    public async run(): Promise<ChildProcessResult> {
        return await new Promise<ChildProcessResult>(async (resolve, reject) => {
            await this.start({
                collect: true,
                onClose: () => {
                    resolve(this.processResult)
                },
                onExit: () => {
                    const didClose = !!this.processResult
                    // Race: 'close' may happen after 'exit'. Do not resolve
                    // before 'close' (the streams may have pending data).
                    if (!didClose) {
                        resolve(this.processResult)
                    }
                },
            }).catch(reject)
            if (!this.childProcess) {
                reject('child process not started')
            }
        })
    }

    public async start(params: ChildProcessStartArguments): Promise<void> {
        if (this.childProcess) {
            throw new Error('process already started')
        }
        getLogger().info(`Running: ${this.toString()}`)

        // Async.
        // See also crossSpawn.spawnSync().
        // Arguments are forwarded[1] to node `child_process` module, see its documentation[2].
        // [1] https://github.com/moxystudio/node-cross-spawn/blob/master/index.js
        // [2] https://nodejs.org/api/child_process.html
        this.childProcess = crossSpawn.spawn(this.command, this.args, this.options)

        this.childProcess.stdout?.on('data', (data: { toString(): string }) => {
            if (params.collect) {
                this.stdoutChunks.push(data.toString())
            }

            if (params.onStdout) {
                params.onStdout(data.toString())
            }
        })

        this.childProcess.stderr?.on('data', (data: { toString(): string }) => {
            if (params.collect) {
                this.stderrChunks.push(data.toString())
            }

            if (params.onStderr) {
                params.onStderr(data.toString())
            }
        })

        // Emitted whenever:
        //  1. Process could not be spawned, or
        //  2. Process could not be killed, or
        //  3. Sending a message to the child process failed.
        // https://nodejs.org/api/child_process.html#child_process_class_childprocess
        this.childProcess.on('error', error => {
            this.processError = error
            if (params.onError) {
                params.onError(error)
            }
        })

        // Emitted when streams are closed.
        this.childProcess.once('close', (code, signal) => {
            const result = this.makeResult(code)
            this.processResult = result

            if (params.onClose) {
                params.onClose(code, signal)
            }

            this.childProcess!.stdout?.removeAllListeners()
            this.childProcess!.stderr?.removeAllListeners()
            this.childProcess!.removeAllListeners()
        })

        // Emitted when process exits or terminates.
        // https://nodejs.org/api/child_process.html#child_process_class_childprocess
        // - If the process exited, `code` is the final exit code of the process, else null.
        // - If the process terminated because of a signal, `signal` is the name of the signal, else null.
        // - One of `code` or `signal` will always be non-null.
        this.childProcess.once('exit', (code, signal) => {
            const result = this.makeResult(typeof code !== 'number' ? -1 : code)
            this.processResult = result

            if (params.onExit) {
                params.onExit(code, signal)
            }
        })
    }

    /**
     * Gets the `run()` result after the child process has finished.
     *
     * stdout/stderr will be empty unless the process was started with `collect=true`.
     *
     * @returns `run()` result, or undefined if the process has not yet started or is still running.
     */
    public result(): ChildProcessResult | undefined {
        return this.processResult
    }

    public pid(): number {
        return this.childProcess?.pid ?? -1
    }

    public exitCode(): number {
        return typeof this.childProcess?.exitCode == 'number' ? this.childProcess.exitCode : -1
    }

    /**
     * Stops the process.
     *
     * SIGTERM won't kill a terminal process, use SIGHUP instead.
     *
     * @param force  Tries SIGKILL if the process is not stopped after a few seconds.
     * @param signal  Signal to send, defaults to SIGTERM.
     *
     */
    public stop(force?: boolean, signal?: string): void {
        const child = this.childProcess
        if (!child) {
            return
        }
        const command = this.command
        const pid = this.pid()
        if (!this.stopped) {
            child.kill(signal)

            if (force === true) {
                waitUntil(
                    async () => {
                        return this.stopped
                    },
                    { timeout: 3000, interval: 200 }
                )
                    .then(stopped => {
                        if (!stopped) {
                            child.kill('SIGKILL')
                        }
                    })
                    .catch(e => {
                        getLogger().warn(`stop(): SIGKILL failed: pid=${pid} command=${command}`)
                    })
            }
        } else {
            throw new Error('Attempting to kill a process that has already been killed')
        }
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
        if (!this.childProcess) {
            return false // Not started yet.
        }
        return !!this.processResult
    }

    public toString(): string {
        const pid = this.pid() > 0 ? `PID ${this.pid()}:` : '(not started)'
        return `${pid} [${this.command} ${this.args.join(' ')}]`
    }
}
