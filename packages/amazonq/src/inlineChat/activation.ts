/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineChatController } from './controller/inlineChatController'
import { registerInlineCommands } from './command/registerInlineCommands'
import { BaseLanguageClient } from 'vscode-languageclient'
import { InlineChatTutorialAnnotation } from '../app/inline/tutorials/inlineChatTutorialAnnotation'

export function activate(
    context: vscode.ExtensionContext,
    client: BaseLanguageClient,
    encryptionKey: Buffer,
    inlineChatTutorialAnnotation: InlineChatTutorialAnnotation
) {
    const inlineChatController = new InlineChatController(context, client, encryptionKey, inlineChatTutorialAnnotation)
    registerInlineCommands(context, inlineChatController)
}
