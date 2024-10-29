/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineChatController } from '../inlineChat/controller/inlineChatController'
import { registerInlineCommands } from '../inlineChat/command/registerInlineCommands'
import { isSageMaker } from 'aws-core-vscode/shared'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { isIamConnection } from 'aws-core-vscode/auth'

export function init(context: vscode.ExtensionContext) {
    if (!(isSageMaker() && isIamConnection(AuthUtil.instance.conn))) {
        const inlineChatController = new InlineChatController(context)
        registerInlineCommands(context, inlineChatController)
    }
}
