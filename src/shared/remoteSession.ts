/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Settings } from '../shared/settings'

export async function openRemoteTerminal(
    options: vscode.TerminalOptions,
    onClose: () => void,
    onError: (err: unknown) => void
) {
    try {
        await withoutShellIntegration(() => {
            const terminal = vscode.window.createTerminal(options)

            const listener = vscode.window.onDidCloseTerminal(t => {
                if (t.processId === terminal.processId) {
                    vscode.Disposable.from(listener, { dispose: onClose }).dispose()
                }
            })

            terminal.show()
        })
    } catch (err) {
        onError(err)
    }
}

// VSC is logging args to the PTY host log file if shell integration is enabled :(
async function withoutShellIntegration<T>(cb: () => T | Promise<T>): Promise<T> {
    const userValue = Settings.instance.get('terminal.integrated.shellIntegration.enabled', Boolean)

    try {
        await Settings.instance.update('terminal.integrated.shellIntegration.enabled', false)
        return await cb()
    } finally {
        Settings.instance.update('terminal.integrated.shellIntegration.enabled', userValue)
    }
}
