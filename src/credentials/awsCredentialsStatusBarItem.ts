/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext, ContextChangeEventsArgs } from '../shared/awsContext'
import { getIdeProperties } from '../shared/extensionUtilities'

const STATUSBAR_PRIORITY = 1
const STATUSBAR_CONNECTED_MSG = localize('AWS.credentials.statusbar.connected', '(connected)')
const STATUSBAR_CONNECTED_DELAY = 1000

// This is a module global since this code doesn't really warrant its own class
let timeoutID: NodeJS.Timeout

export async function initializeAwsCredentialsStatusBarItem(
    awsContext: AwsContext,
    context: vscode.ExtensionContext
): Promise<void> {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUSBAR_PRIORITY)
    statusBarItem.command = 'aws.login'
    statusBarItem.show()
    updateCredentialsStatusBarItem(statusBarItem)

    context.subscriptions.push(statusBarItem)

    context.subscriptions.push(
        awsContext.onDidChangeContext(async (ev: ContextChangeEventsArgs) => {
            updateCredentialsStatusBarItem(statusBarItem, ev.profileName, ev.developerMode)
        })
    )
}

// Resolves when the status bar reaches its final state
export async function updateCredentialsStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    credentialsId?: string,
    developerMode?: Set<string>
): Promise<void> {
    clearTimeout(timeoutID)
    const connectedMsg = localize(
        'AWS.credentials.statusbar.connected',
        'Connected to {0} with "{1}" (click to change)',
        getIdeProperties().company,
        credentialsId
    )
    const disconnectedMsg = localize(
        'AWS.credentials.statusbar.disconnected',
        'Click to connect to {0}',
        getIdeProperties().company
    )

    if (developerMode && developerMode.size > 0) {
        ;(statusBarItem as any).backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')

        const devSettingsStr = Array.from(developerMode).join('  \n')
        statusBarItem.tooltip = `Toolkit developer settings:\n${devSettingsStr}`
    } else {
        ;(statusBarItem as any).backgroundColor = undefined
        statusBarItem.tooltip = credentialsId ? connectedMsg : disconnectedMsg
    }

    // Shows "connected" message briefly.
    let delay = 0
    if (credentialsId) {
        delay = STATUSBAR_CONNECTED_DELAY
        statusBarItem.text = `${getIdeProperties().company}: ${STATUSBAR_CONNECTED_MSG}`
    }

    return new Promise<void>(
        resolve =>
            (timeoutID = setTimeout(() => {
                const company = getIdeProperties().company
                statusBarItem.text = (credentialsId ? `${company}: ${credentialsId}` : company),
                resolve()
            }, delay))
    )
}
