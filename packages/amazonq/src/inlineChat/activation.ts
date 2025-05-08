/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineChatController } from './controller/inlineChatController'
import { registerInlineCommands } from './command/registerInlineCommands'
import { LanguageClient } from 'vscode-languageclient'
import { InlineLineAnnotationController } from '../app/inline/stateTracker/inlineLineAnnotationTracker'

export function activate(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    encryptionKey: Buffer,
    inlineLineAnnotationController: InlineLineAnnotationController
) {
    const inlineChatController = new InlineChatController(
        context,
        client,
        encryptionKey,
        inlineLineAnnotationController
    )
    registerInlineCommands(context, inlineChatController)
}
