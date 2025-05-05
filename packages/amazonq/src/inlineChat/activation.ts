/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { InlineChatController } from './controller/inlineChatController'
import { registerInlineCommands } from './command/registerInlineCommands'

export function activate(context: vscode.ExtensionContext, client: LanguageClient, encryptionKey: Buffer) {
    const inlineChatController = new InlineChatController(context, client, encryptionKey)
    registerInlineCommands(context, inlineChatController)
}
