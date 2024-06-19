/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { ApplicationComposerManager } from '../webviewManager'
import vscode from 'vscode'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'

export const openTemplateInComposerCommand = Commands.declare(
    'aws.openInApplicationComposer',
    (manager: ApplicationComposerManager) => async (arg?: vscode.TextEditor | vscode.Uri) => {
        const authState = await AuthUtil.instance.getChatAuthState()

        let result: vscode.WebviewPanel | undefined
        await telemetry.appcomposer_openTemplate.run(async span => {
            span.record({
                hasChatAuth: authState.codewhispererChat === 'connected' || authState.codewhispererChat === 'expired',
            })
            arg ??= vscode.window.activeTextEditor
            const input = arg instanceof vscode.Uri ? arg : arg?.document

            if (!input) {
                throw new ToolkitError('No active text editor or document found')
            }

            result = await manager.visualizeTemplate(input)
        })
        return result
    }
)
