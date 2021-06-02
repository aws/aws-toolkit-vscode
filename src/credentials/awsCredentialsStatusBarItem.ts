/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext, ContextChangeEventsArgs } from '../shared/awsContext'
import { getIdeProperties } from '../shared/extensionUtilities'

const STATUSBAR_PRIORITY = 100
const STATUSBAR_TEXT_NO_CREDENTIALS = localize('AWS.credentials.statusbar.no.credentials', '(not connected)')
const STATUSBAR_TEXT_CONNECTED = localize('AWS.credentials.statusbar.connected', '(connected)')
const STATUSBAR_CONNECTED_DELAY = 1000

// This is a module global since this code doesn't really warrant its own class
let timeoutID: NodeJS.Timeout

export async function initializeAwsCredentialsStatusBarItem(
    awsContext: AwsContext,
    context: vscode.ExtensionContext
): Promise<void> {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUSBAR_PRIORITY)
    statusBarItem.command = 'aws.login'
    statusBarItem.tooltip = localize(
        'AWS.credentials.statusbar.tooltip',
        'The current credentials used by the {0} Toolkit.\n\nClick this status bar item to use different credentials.',
        getIdeProperties().company
    )
    statusBarItem.show()
    updateCredentialsStatusBarItem(statusBarItem)

    context.subscriptions.push(statusBarItem)

    context.subscriptions.push(
        awsContext.onDidChangeContext(async (awsContextChangedEvent: ContextChangeEventsArgs) => {
            updateCredentialsStatusBarItem(statusBarItem, awsContextChangedEvent.profileName)
        })
    )
}

// Resolves when the status bar reaches its final state
export async function updateCredentialsStatusBarItem(statusBarItem: vscode.StatusBarItem, credentialsId?: string): Promise<void> {
    clearTimeout(timeoutID)

    // Shows confirmation text in the status bar message
    let delay = 0
    if (credentialsId) {
        delay = STATUSBAR_CONNECTED_DELAY
        statusBarItem.text = localize('AWS.credentials.statusbar.text', '{0}: {1}', getIdeProperties().company, STATUSBAR_TEXT_CONNECTED)
    }

    return new Promise<void>(
        resolve =>
            (timeoutID = setTimeout(() => {
                statusBarItem.text = localize(
                    'AWS.credentials.statusbar.text',
                    '{0}: {1}',
                    getIdeProperties().company,
                    credentialsId ?? STATUSBAR_TEXT_NO_CREDENTIALS
                )
                resolve()
            }, delay))
    )
}
