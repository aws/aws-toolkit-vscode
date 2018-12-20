/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as child_process from 'child_process'
import * as events from 'events'

export interface SamCliProcessResult {
    process: SamCliProcess,
    exitCode: number,
    error: Error | undefined,
    stdout: string,
    stderr: string
}

/**
 * Manages a child process making a sam cli call
 * To use:
 * - instantiate
 * - call start
 * - await promise to get the results
 */
export class SamCliProcess {
    private static readonly CHILD_PROCESS_CLOSED = 'childProcessClosed'

    private readonly _process: string
    private readonly _args: string[] | undefined

    private _childProcess: child_process.ChildProcess | undefined = undefined
    private readonly _onChildProcessClosed: events.EventEmitter = new events.EventEmitter()
    private readonly _stdoutChunks: string[] = []
    private readonly _stderrChunks: string[] = []
    private _error: Error | undefined
    private readonly _processCompletedPromise: Promise<SamCliProcessResult>

    public constructor(process: string, args?: string[] | undefined) {
        this._process = process
        this._args = args

        this._processCompletedPromise = new Promise((resolve, reject) => {
            this._onChildProcessClosed.once(
                SamCliProcess.CHILD_PROCESS_CLOSED,
                (processResult: SamCliProcessResult) => {
                    resolve(processResult)
                })
        })
    }

    public start(): void {
        if (!!this._childProcess) {
            throw Error('process already started')
        }

        this._childProcess = child_process.spawn(
            this._process,
            this._args
        )

        this._childProcess.stdout.on('data', data => {
            this._stdoutChunks.push(data.toString())
        })

        this._childProcess.stderr.on('data', data => {
            this._stderrChunks.push(data.toString())
        })

        this._childProcess.on('error', (error) => {
            this._error = error
        })

        this._childProcess.on('close', (code, signal) => {
            const processResult: SamCliProcessResult = {
                process: this,
                exitCode: code,
                stdout: this._stdoutChunks.join().trim(),
                stderr: this._stderrChunks.join().trim(),
                error: this._error
            }

            this._onChildProcessClosed.emit(SamCliProcess.CHILD_PROCESS_CLOSED, processResult)
        })
    }

    public async promise(): Promise<SamCliProcessResult> {
        if (!this._childProcess) {
            throw new Error('child process not started')
        }

        return this._processCompletedPromise
    }
}
