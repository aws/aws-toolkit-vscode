/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { CawsAuthenticationProvider } from './auth'
const localize = nls.loadMessageBundle()

const STATUS_PRIORITY = 1
const STATUS_TOOLTIP = localize('AWS.caws.statusbar.tooltip', 'Click to connect to CODE.AWS or check its status.')

export function initStatusbar(authProvider: CawsAuthenticationProvider): vscode.Disposable {
    const statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_PRIORITY)
    statusbarItem.command = 'aws.caws.connect'
    statusbarItem.tooltip = STATUS_TOOLTIP
    statusbarItem.show()
    setCawsStatusbar(statusbarItem)

    return vscode.Disposable.from(
        statusbarItem,
        authProvider.onDidChangeSessions(e => {
            const session = authProvider.listSessions()[0]
            setCawsStatusbar(statusbarItem, session?.accountDetails.label)
        })
    )
}

function setCawsStatusbar(statusBarItem: vscode.StatusBarItem, username?: string): void {
    statusBarItem.text = localize('AWS.caws.statusbar.text', 'CODE.AWS: {0}', username || '-')
}
