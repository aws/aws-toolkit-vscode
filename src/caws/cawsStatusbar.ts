/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CawsAuthenticationProvider } from './auth'
import { CawsCommands } from './commands'

const STATUS_PRIORITY = 1
const STATUS_TOOLTIP = localize('AWS.caws.statusbar.tooltip', 'Click to connect to REMOVED.codes or check its status.')

export function initStatusbar(authProvider: CawsAuthenticationProvider): vscode.Disposable {
    const statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_PRIORITY)
    statusbarItem.command = CawsCommands.declared.login.id
    statusbarItem.tooltip = STATUS_TOOLTIP
    statusbarItem.show()

    const update = () => setCawsStatusbar(statusbarItem, authProvider.activeAccount?.label)

    update()

    return vscode.Disposable.from(statusbarItem, authProvider.onDidChangeSession(update))
}

function setCawsStatusbar(statusBarItem: vscode.StatusBarItem, username?: string): void {
    statusBarItem.text = localize('AWS.caws.statusbar.text', 'REMOVED.codes: {0}', username || '-')
}
