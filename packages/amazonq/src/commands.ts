/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Amazon Q extension commands and implementations.
 */
import * as vscode from 'vscode'
import { Auth } from 'aws-core-vscode/auth'
import { Commands } from 'aws-core-vscode/shared'

export function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(Commands.register('_aws.amazonq.auth.autoConnect', Auth.instance.tryAutoConnect))
}
