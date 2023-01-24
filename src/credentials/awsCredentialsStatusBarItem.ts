/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { getIdeProperties } from '../shared/extensionUtilities'
import { DevSettings } from '../shared/settings'
import { Auth, login } from './auth'

const statusbarPriority = 1

export async function initializeAwsCredentialsStatusBarItem(
    awsContext: AwsContext,
    context: vscode.ExtensionContext
): Promise<void> {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, statusbarPriority)
    statusBarItem.command = login.build().asCommand({ title: 'Login' })
    statusBarItem.show()
    updateCredentialsStatusBarItem(statusBarItem)

    context.subscriptions.push(statusBarItem)

    const devSettings = DevSettings.instance
    handleDevSettings(devSettings, statusBarItem)

    context.subscriptions.push(
        Auth.instance.onDidChangeActiveConnection(conn => {
            const color = conn?.state === 'invalid' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined
            updateCredentialsStatusBarItem(statusBarItem, conn?.label, color)
            handleDevSettings(devSettings, statusBarItem)
        }),
        devSettings.onDidChangeActiveSettings(() => handleDevSettings(devSettings, statusBarItem))
    )
}

function handleDevSettings(devSettings: DevSettings, statusBarItem: vscode.StatusBarItem) {
    const developerMode = Object.keys(devSettings.activeSettings)

    if (developerMode.length > 0) {
        ;(statusBarItem as any).backgroundColor ??= new vscode.ThemeColor('statusBarItem.warningBackground')

        const devSettingsStr = developerMode.join('  \n')
        statusBarItem.tooltip = `Toolkit developer settings:\n${devSettingsStr}`
    }
}

// Resolves when the status bar reaches its final state
export async function updateCredentialsStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    credentialsId?: string,
    color?: vscode.ThemeColor
): Promise<void> {
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

    const company = getIdeProperties().company
    statusBarItem.tooltip = credentialsId ? connectedMsg : disconnectedMsg
    statusBarItem.text = credentialsId ? `${company}: ${credentialsId}` : company
    ;(statusBarItem as any).backgroundColor = color
}
