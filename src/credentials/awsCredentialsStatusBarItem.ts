/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { getIdeProperties } from '../shared/extensionUtilities'
import globals from '../shared/extensionGlobals'
import { DevSettings } from '../shared/settings'
import { Auth, switchConnections } from './auth'

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
    statusBarItem.command = switchConnections.build(Auth.instance).asCommand({ title: 'Switch Connections' })
    statusBarItem.show()
    updateCredentialsStatusBarItem(statusBarItem)

    context.subscriptions.push(statusBarItem)

    const devSettings = DevSettings.instance
    handleDevSettings(devSettings, statusBarItem)

    context.subscriptions.push(
        Auth.instance.onDidChangeActiveConnection(conn => {
            updateCredentialsStatusBarItem(statusBarItem, conn?.label)
            handleDevSettings(devSettings, statusBarItem)
        }),
        devSettings.onDidChangeActiveSettings(() => handleDevSettings(devSettings, statusBarItem))
    )
}

function handleDevSettings(devSettings: DevSettings, statusBarItem: vscode.StatusBarItem) {
    const developerMode = Object.keys(devSettings.activeSettings)

    if (developerMode.length > 0) {
        ;(statusBarItem as any).backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')

        const devSettingsStr = developerMode.join('  \n')
        statusBarItem.tooltip = `Toolkit developer settings:\n${devSettingsStr}`
    } else {
        ;(statusBarItem as any).backgroundColor = undefined
    }
}

// Resolves when the status bar reaches its final state
export async function updateCredentialsStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    credentialsId?: string
): Promise<void> {
    globals.clock.clearTimeout(timeoutID)
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

    statusBarItem.tooltip = credentialsId ? connectedMsg : disconnectedMsg

    // Shows "connected" message briefly.
    let delay = 0
    if (credentialsId) {
        delay = STATUSBAR_CONNECTED_DELAY
        statusBarItem.text = `${getIdeProperties().company}: ${STATUSBAR_CONNECTED_MSG}`
    }

    return new Promise<void>(
        resolve =>
            (timeoutID = globals.clock.setTimeout(() => {
                const company = getIdeProperties().company
                ;(statusBarItem.text = credentialsId ? `${company}: ${credentialsId}` : company), resolve()
            }, delay))
    )
}
