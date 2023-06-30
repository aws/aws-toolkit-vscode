/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Settings } from '../shared/settings'
import { showMessageWithCancel } from './utilities/messages'
import { Timeout } from './utilities/timeoutUtils'

export async function openRemoteTerminal(options: vscode.TerminalOptions, onClose: () => void) {
    const timeout = new Timeout(60000)

    await showMessageWithCancel('AWS: Starting session...', timeout, 1000)
    await withoutShellIntegration(async () => {
        const terminal = vscode.window.createTerminal(options)

        const listener = vscode.window.onDidCloseTerminal(t => {
            if (t.processId === terminal.processId) {
                vscode.Disposable.from(listener, { dispose: onClose }).dispose()
            }
        })

        terminal.show()
    }).finally(() => timeout.cancel())
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
