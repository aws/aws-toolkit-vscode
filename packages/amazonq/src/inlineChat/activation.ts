/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineChatController } from './controller/inlineChatController'
import { registerInlineCommands } from './command/registerInlineCommands'

export function activate(context: vscode.ExtensionContext) {
    const inlineChatController = new InlineChatController(context)
    registerInlineCommands(context, inlineChatController)
}
