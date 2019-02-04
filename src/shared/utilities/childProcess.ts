/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as child_process from 'child_process'
import * as crossSpawn from 'cross-spawn'
import * as events from 'events'

export interface ChildProcessResult {
    exitCode: number,
    error: Error | undefined,
    stdout: string,
    stderr: string
}

/**
 * Convenience class to manage a child process
 * To use:
 * - instantiate
 * - call start
 * - await promise to get the results (pass or fail)
 */
export class ChildProcess {
    private static readonly CHILD_PROCESS_CLOSED = 'childProcessClosed'

    private readonly args: string[]
    private childProcess: child_process.ChildProcess | undefined
    private readonly onChildProcessClosed: events.EventEmitter = new events.EventEmitter()
    private readonly stdoutChunks: string[] = []
    private readonly stderrChunks: string[] = []
    private error: Error | undefined
    private readonly processCompletedPromise: Promise<ChildProcessResult>

    public constructor(
        private readonly process: string,
        private readonly options?: child_process.SpawnOptions,
        ...args: string[]
    ) {
        this.args = args
        this.processCompletedPromise = new Promise((resolve, reject) => {
            this.onChildProcessClosed.once(
                ChildProcess.CHILD_PROCESS_CLOSED,
                (processResult: ChildProcessResult) => {
                    resolve(processResult)
                })
        })
    }

    public start(): void {
        if (this.childProcess) {
            throw new Error('process already started')
        }

        this.childProcess = crossSpawn(
            this.process,
            this.args,
            this.options
        )

        this.childProcess.stdout.on('data', (data: { toString(): string }) => {
            this.stdoutChunks.push(data.toString())
        })

        this.childProcess.stderr.on('data', (data: { toString(): string }) => {
            this.stderrChunks.push(data.toString())
        })

        this.childProcess.on('error', (error) => {
            this.error = error
        })

        this.childProcess.on('close', (code, signal) => {
            const processResult: ChildProcessResult = {
                exitCode: code,
                stdout: this.stdoutChunks.join().trim(),
                stderr: this.stderrChunks.join().trim(),
                error: this.error
            }

            this.childProcess!.removeAllListeners()
            this.onChildProcessClosed.emit(ChildProcess.CHILD_PROCESS_CLOSED, processResult)
        })
    }

    public async promise(): Promise<ChildProcessResult> {
        if (!this.childProcess) {
            throw new Error('child process not started')
        }

        return this.processCompletedPromise
    }
}
