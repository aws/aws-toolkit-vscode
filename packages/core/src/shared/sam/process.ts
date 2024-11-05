/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { UnknownError } from '../errors'
import { getLogger } from '../logger'
import { ChildProcessResult, ChildProcess } from '../utilities/processUtils'
import { isAutomation } from '../vscode/env'

// This is a decent improvement over using the output channel but it isn't a tty/pty
// SAM CLI uses `click` which has reduced functionality if `os.isatty` returns false
// Historically, Windows lack of a pty-equivalent is why it's not available in libuv
// Maybe it's doable now with the ConPTY API? https://github.com/libuv/libuv/issues/2640
export class ProcessTerminal implements vscode.Pseudoterminal {
    private readonly onDidCloseEmitter = new vscode.EventEmitter<number | void>()
    private readonly onDidWriteEmitter = new vscode.EventEmitter<string>()
    private readonly onDidExitEmitter = new vscode.EventEmitter<ChildProcessResult>()
    public readonly onDidWrite = this.onDidWriteEmitter.event
    public readonly onDidClose = this.onDidCloseEmitter.event
    public readonly onDidExit = this.onDidExitEmitter.event

    public constructor(private readonly process: ChildProcess) {
        // Used in integration tests
        if (isAutomation()) {
            // Disable because it is a test.
            // eslint-disable-next-line aws-toolkits/no-console-log
            this.onDidWrite((text) => console.log(text.trim()))
        }
    }

    #cancelled = false
    public get cancelled() {
        return this.#cancelled
    }

    public get stopped() {
        return this.process.stopped
    }

    public open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.process
            .run({
                onStdout: (text) => this.mapStdio(text),
                onStderr: (text) => this.mapStdio(text),
            })
            .then((result) => this.onDidExitEmitter.fire(result))
            .catch((err) =>
                this.onDidExitEmitter.fire({ error: UnknownError.cast(err), exitCode: -1, stderr: '', stdout: '' })
            )
            .finally(() => this.onDidWriteEmitter.fire('\r\nPress any key to close this terminal'))
    }

    public close(): void {
        this.process.stop()
        this.onDidCloseEmitter.fire()
    }

    public handleInput(data: string) {
        // ETX
        if (data === '\u0003' || this.process.stopped) {
            this.#cancelled ||= data === '\u0003'
            return this.close()
        }

        // enter
        if (data === '\u000D') {
            this.process.send('\n').then(undefined, (e) => {
                getLogger().error('ProcessTerminal: process.send() failed: %s', (e as Error).message)
            })
            this.onDidWriteEmitter.fire('\r\n')
        } else {
            this.process.send(data).then(undefined, (e) => {
                getLogger().error('ProcessTerminal: process.send() failed: %s', (e as Error).message)
            })
            this.onDidWriteEmitter.fire(data)
        }
    }

    private mapStdio(text: string): void {
        const lines = text.split('\n')
        const first = lines.shift()

        if (first) {
            this.onDidWriteEmitter.fire(first)
        }

        for (const line of lines) {
            this.onDidWriteEmitter.fire('\r\n')
            this.onDidWriteEmitter.fire(line)
        }
    }
}
