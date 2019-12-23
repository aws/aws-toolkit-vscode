/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext, ContextChangeEventsArgs } from '../shared/awsContext'

const STATUSBAR_PRIORITY = 100
const STATUSBAR_TEXT_NO_CREDENTIALS = localize('AWS.credentials.statusbar.no.credentials', '(not connected)')

export async function initializeAwsCredentialsStatusBarItem(
    awsContext: AwsContext,
    context: vscode.ExtensionContext
): Promise<void> {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUSBAR_PRIORITY)
    statusBarItem.command = 'aws.login'
    statusBarItem.tooltip = localize(
        'AWS.credentials.statusbar.tooltip',
        'The current credentials used by the AWS Toolkit.\n\nClick this status bar item to use different credentials.'
    )
    statusBarItem.show()

    context.subscriptions.push(statusBarItem)

    context.subscriptions.push(
        awsContext.onDidChangeContext(async (awsContextChangedEvent: ContextChangeEventsArgs) => {
            updateCredentialsStatusBarItem(statusBarItem, awsContextChangedEvent.profileName)
        })
    )
}

export function updateCredentialsStatusBarItem(statusBarItem: vscode.StatusBarItem, credentialsId?: string) {
    statusBarItem.text = localize(
        'AWS.credentials.statusbar.text',
        'AWS Credentials: {0}',
        credentialsId ?? STATUSBAR_TEXT_NO_CREDENTIALS
    )
}
