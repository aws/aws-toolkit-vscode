/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ContextChangeEventsArgs } from '../shared/awsContext'
import globals from '../shared/extensionGlobals'
const localize = nls.loadMessageBundle()

const STATUS_PRIORITY = 1
const STATUS_TOOLTIP = localize('AWS.caws.statusbar.tooltip', 'Click to connect to CODE.AWS or check its status.')

export async function initStatusbar(): Promise<void> {
    const statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_PRIORITY)
    statusbarItem.command = 'aws.caws.connect'
    statusbarItem.tooltip = STATUS_TOOLTIP
    statusbarItem.show()
    setCawsStatusbar(statusbarItem)

    globals.context.subscriptions.push(
        statusbarItem,
        globals.awsContext.onDidChangeContext(async (ev: ContextChangeEventsArgs) => {
            setCawsStatusbar(statusbarItem, ev.cawsUsername)
        })
    )
}

// Resolves when the status bar reaches its final state
async function setCawsStatusbar(statusBarItem: vscode.StatusBarItem, username?: string): Promise<void> {
    if (username) {
        statusBarItem.text = localize('AWS.caws.statusbar.text', 'CODE.AWS: {0}', username)
    } else {
        statusBarItem.text = localize('AWS.caws.statusbar.text', 'CODE.AWS: {0}', '-')
    }
}
