/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as crossSpawn from 'cross-spawn'
import { getLogger } from '../logger'

export interface ChildProcessStartArguments {
    onStdout?(text: string): void
    onStderr?(text: string): void
    onError?(error: Error): void
    onClose?(code: number, signal: string): void
}

export interface ChildProcessResult {
    exitCode: number
    error: Error | undefined
    stdout: string
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

    public constructor(
        private readonly process: string,
        private readonly options?: child_process.SpawnOptions,
        ...args: string[]
    ) {
        this.args = args
    }

    public async run(): Promise<ChildProcessResult> {
        return await new Promise<ChildProcessResult>(async (resolve, reject) => {
            let childProcessError: Error | undefined
            const stdoutChunks: string[] = []
            const stderrChunks: string[] = []

            await this.start({
                onStdout: text => stdoutChunks.push(text),
                onStderr: text => stderrChunks.push(text),
                onError: error => (childProcessError = error),
                onClose: (code, signal) => {
                    const processResult: ChildProcessResult = {
                        exitCode: code,
                        stdout: stdoutChunks.join().trim(),
                        stderr: stderrChunks.join().trim(),
                        error: childProcessError,
                    }

                    resolve(processResult)
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

        getLogger().info(`Running command: ${this.process} ${this.args.join(' ')}`)
        this.childProcess = crossSpawn(this.process, this.args, this.options)

        this.childProcess.stdout?.on('data', (data: { toString(): string }) => {
            if (params.onStdout) {
                params.onStdout(data.toString())
            }
        })

        this.childProcess.stderr?.on('data', (data: { toString(): string }) => {
            if (params.onStderr) {
                params.onStderr(data.toString())
            }
        })

        this.childProcess.on('error', error => {
            if (params.onError) {
                params.onError(error)
            }
        })

        this.childProcess.once('close', (code, signal) => {
            if (params.onClose) {
                params.onClose(code, signal)
            }

            this.childProcess!.stdout?.removeAllListeners()
            this.childProcess!.stderr?.removeAllListeners()
            this.childProcess!.removeAllListeners()
        })
    }

    public kill(): void {
        if (this.childProcess && !this.killed) {
            this.childProcess.kill()
        } else {
            throw new Error('Attempting to kill a process that has already been killed')
        }
    }

    public get killed(): boolean {
        // default to true for safety
        return this.childProcess ? this.childProcess.killed : true
    }
}
