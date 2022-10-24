/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CodeCatalystAuthenticationProvider } from './auth'
import { CodeCatalystCommands } from './commands'

const STATUS_PRIORITY = 1
const STATUS_TOOLTIP = localize(
    'AWS.codecatalyst.statusbar.tooltip',
    'Click to connect to REMOVED.codes or check its status.'
)

export function initStatusbar(authProvider: CodeCatalystAuthenticationProvider): vscode.Disposable {
    const statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_PRIORITY)
    statusbarItem.command = CodeCatalystCommands.declared.login.id
    statusbarItem.tooltip = STATUS_TOOLTIP
    statusbarItem.show()

    const update = () => setCodeCatalystStatusbar(statusbarItem, authProvider.activeAccount?.label)

    update()

    return vscode.Disposable.from(statusbarItem, authProvider.onDidChangeSession(update))
}

function setCodeCatalystStatusbar(statusBarItem: vscode.StatusBarItem, username?: string): void {
    statusBarItem.text = localize('AWS.codecatalyst.statusbar.text', 'REMOVED.codes: {0}', username || '-')
}
