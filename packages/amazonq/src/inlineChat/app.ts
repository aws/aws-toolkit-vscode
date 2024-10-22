/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineChatController } from '../inlineChat/controller/inlineChatController'
import { registerInlineCommands } from '../inlineChat/command/registerInlineCommands'

export function init(context: vscode.ExtensionContext) {
    const inlineChatController = new InlineChatController(context)
    registerInlineCommands(context, inlineChatController)
}
