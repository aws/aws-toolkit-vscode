/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as child_process from 'child_process'
import * as crossSpawn from 'cross-spawn'

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
 * - call and await run to get the results (pass or fail)
 */
export class ChildProcess {
    private readonly args: string[]
    private childProcess: child_process.ChildProcess | undefined
    private readonly stdoutChunks: string[] = []
    private readonly stderrChunks: string[] = []
    private error: Error | undefined

    public constructor(
        private readonly process: string,
        private readonly options?: child_process.SpawnOptions,
        ...args: string[]
    ) {
        this.args = args
    }

    public async run(): Promise<ChildProcessResult> {
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

        return await new Promise<ChildProcessResult>((resolve, reject) => {
            if (!this.childProcess) {
                reject('child process not started')

                return
            }

            this.childProcess.once('close', (code, signal) => {
                const processResult: ChildProcessResult = {
                    exitCode: code,
                    stdout: this.stdoutChunks.join().trim(),
                    stderr: this.stderrChunks.join().trim(),
                    error: this.error
                }

                if (this.childProcess) {
                    this.childProcess.stdout.removeAllListeners()
                    this.childProcess.stderr.removeAllListeners()
                    this.childProcess.removeAllListeners()
                }

                resolve(processResult)
            })
        })
    }
}
