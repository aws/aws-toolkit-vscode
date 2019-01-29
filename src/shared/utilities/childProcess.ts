/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as child_process from 'child_process'
import * as events from 'events'

export function sanitizeCommand(command: string): string {
    if (process.platform === 'win32') {
        if (command.indexOf(' ') >= 0 && !command.startsWith('\"') && !command.endsWith('\"')) {
            return `"${command}"`
        }
    }

    return command
}

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

    private readonly _command: string
    private readonly _args: string[] | undefined

    private _childProcess: child_process.ChildProcess | undefined
    private readonly _onChildProcessClosed: events.EventEmitter = new events.EventEmitter()
    private readonly _stdoutChunks: string[] = []
    private readonly _stderrChunks: string[] = []
    private _error: Error | undefined
    private readonly _processCompletedPromise: Promise<ChildProcessResult>

    public constructor(command: string, args?: string[] | undefined) {
        this._command = sanitizeCommand(command)
        this._args = args

        this._processCompletedPromise = new Promise((resolve, reject) => {
            this._onChildProcessClosed.once(
                ChildProcess.CHILD_PROCESS_CLOSED,
                (processResult: ChildProcessResult) => {
                    resolve(processResult)
                })
        })
    }

    public start(): void {
        if (!!this._childProcess) {
            throw Error('process already started')
        }

        const spawnOptions: child_process.SpawnOptions = {}

        if (process.platform === 'win32') {
            spawnOptions.shell = true
        }

        this._childProcess = child_process.spawn(
            this._command,
            this._args,
            spawnOptions
        )

        this._childProcess.stdout.on('data', (data: { toString(): string }) => {
            this._stdoutChunks.push(data.toString())
        })

        this._childProcess.stderr.on('data', (data: { toString(): string }) => {
            this._stderrChunks.push(data.toString())
        })

        this._childProcess.on('error', (error) => {
            this._error = error
        })

        this._childProcess.on('close', (code, signal) => {
            const processResult: ChildProcessResult = {
                exitCode: code,
                stdout: this._stdoutChunks.join().trim(),
                stderr: this._stderrChunks.join().trim(),
                error: this._error
            }

            this._onChildProcessClosed.emit(ChildProcess.CHILD_PROCESS_CLOSED, processResult)
        })
    }

    public async promise(): Promise<ChildProcessResult> {
        if (!this._childProcess) {
            throw new Error('child process not started')
        }

        return this._processCompletedPromise
    }
}
