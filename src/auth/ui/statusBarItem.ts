/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../../shared/awsContext'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { DevSettings } from '../../shared/settings'
import { Auth } from '../auth'
import { getAllConnectionsInUse, onDidChangeConnections } from '../secondaryAuth'
import { codicon, getIcon } from '../../shared/icons'
import { debounce } from '../../shared/utilities/functionUtils'
import { login } from '../utils'

const statusbarPriority = 1

export async function initializeAwsCredentialsStatusBarItem(
    awsContext: AwsContext,
    context: vscode.ExtensionContext
): Promise<void> {
    const devSettings = DevSettings.instance
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, statusbarPriority)
    statusBarItem.command = login.build().asCommand({ title: 'Login' })
    statusBarItem.show()

    const update = debounce(() => updateItem(statusBarItem, devSettings))

    await update()
    context.subscriptions.push(
        statusBarItem,
        onDidChangeConnections(() => update()),
        Auth.instance.onDidChangeActiveConnection(() => update()),
        Auth.instance.onDidChangeConnectionState(() => update()),
        devSettings.onDidChangeActiveSettings(() => update())
    )
}

function handleDevSettings(statusBarItem: vscode.StatusBarItem, devSettings: DevSettings) {
    if (devSettings.isDevMode()) {
        ;(statusBarItem as any).backgroundColor ??= new vscode.ThemeColor('statusBarItem.warningBackground')

        const devSettingsStr = Object.keys(devSettings.activeSettings).join('  \n')
        statusBarItem.tooltip = `Toolkit developer settings:\n${devSettingsStr}`
    }
}

function updateItem(statusBarItem: vscode.StatusBarItem, devSettings: DevSettings): void {
    const company = getIdeProperties().company
    const connections = getAllConnectionsInUse(Auth.instance)
    const connectedTooltip = localize(
        'AWS.credentials.statusbar.connected',
        'Connected to {0} with "{1}" (click to change)',
        getIdeProperties().company,
        connections[0]?.label
    )
    const disconnectedTooltip = localize(
        'AWS.credentials.statusbar.disconnected',
        'Click to connect to {0}',
        getIdeProperties().company
    )

    const icon = connections.some(c => c.state !== 'valid') ? getIcon('vscode-error') : getIcon('vscode-check')
    const getText = (text: string) => codicon`${icon} ${company}: ${text}`
    if (connections.length === 0) {
        statusBarItem.text = company
        statusBarItem.tooltip = disconnectedTooltip
    } else if (connections.length === 1) {
        statusBarItem.text = getText(connections[0].label)
        statusBarItem.tooltip = connectedTooltip
    } else {
        const expired = connections.filter(c => c.state !== 'valid')
        if (expired.length !== 0) {
            statusBarItem.text = getText(`${expired.length} of ${connections.length} Connections Expired`)
        } else {
            statusBarItem.text = getText(`${connections.length} Connections`)
        }
    }

    const color = connections.some(c => c.state !== 'valid')
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : undefined
    ;(statusBarItem as any).backgroundColor = color

    // Do this last to override the normal behavior
    handleDevSettings(statusBarItem, devSettings)
}
