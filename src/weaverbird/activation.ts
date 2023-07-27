/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'
import { registerChatView, showChat } from './vue/chat/backend'

/**
 * Activate Weaverbird functionality for the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(Commands.register('aws.weaverbird.openChat', () => showChat(context)))
    registerChatView(context)
}
