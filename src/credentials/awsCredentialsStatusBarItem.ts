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
const STATUSBAR_PRIORITY = 1
const STATUSBAR_CONNECTED_MSG = localize('AWS.statusbar.connected', '(connected)')
const STATUSBAR_CONNECTED_DELAY = 1000

let timeoutID: NodeJS.Timeout
let lastCredentialsId: string | undefined

export async function initializeAwsCredentialsStatusBarItem(
    awsContext: AwsContext,
    context: vscode.ExtensionContext
): Promise<void> {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUSBAR_PRIORITY)
    statusBarItem.command = 'aws.login'
    statusBarItem.show()
    updateCredentialsStatusBarItem(statusBarItem)

    context.subscriptions.push(statusBarItem)

    const devSettings = DevSettings.instance
    handleDevSettings(devSettings, statusBarItem)

    context.subscriptions.push(
        awsContext.onDidChangeContext(async ev => {
            updateCredentialsStatusBarItem(statusBarItem, ev.profileName, ev.status)
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

/**
 * Sets the content of the statusbar item.
 *
 * @param statusBarItem
 * @param credentialsId
 * @param cwStatus Codewhisperer status
 */
export async function updateCredentialsStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    credentialsId?: string,
    cwStatus: 'enabled' | 'running' | 'disabled' = 'disabled'
): Promise<void> {
    const company = getIdeProperties().company
    globals.clock.clearTimeout(timeoutID)

    const connectedMsg = localize('AWS.statusbar.connected', 'Connected to {0} with "{1}"', company, credentialsId)
    const disconnectedMsg = localize('AWS.statusbar.disconnected', 'Connect to {0}', company)
    const cwTooltip = localize('AWS.statusbar.codewhisperer', 'CodeWhisperer is {0}', cwStatus)

    statusBarItem.tooltip = credentialsId ? connectedMsg : disconnectedMsg
    if (cwStatus !== 'disabled') {
        statusBarItem.tooltip += `\n${cwTooltip}`
    }

    const statusIcon = cwStatus === 'disabled' ? '' : cwStatus === 'running' ? '$(loading~spin)' : '$(check)'

    let delay = 0
    if (credentialsId && lastCredentialsId !== credentialsId) {
        // Show "connected" message briefly.
        delay = STATUSBAR_CONNECTED_DELAY
        statusBarItem.text = `${statusIcon}${company}: ${STATUSBAR_CONNECTED_MSG}`
        lastCredentialsId = credentialsId
    }

    return new Promise<void>(
        resolve =>
            (timeoutID = globals.clock.setTimeout(() => {
                ;(statusBarItem.text = credentialsId ? `${statusIcon}${company}: ${credentialsId}` : company), resolve()
            }, delay))
    )
}
