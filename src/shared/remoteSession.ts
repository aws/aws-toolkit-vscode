/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { withoutShellIntegration } from '../ecs/commands'

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
