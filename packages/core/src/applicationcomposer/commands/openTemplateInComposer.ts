/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { ApplicationComposerManager } from '../webviewManager'
import vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { getAmazonqApi } from '../../amazonq/extApi'

export const openTemplateInComposerCommand = Commands.declare(
    'aws.openInApplicationComposer',
    (manager: ApplicationComposerManager) => async (arg?: vscode.TextEditor | vscode.Uri) => {
        let result: vscode.WebviewPanel | undefined
        await telemetry.appcomposer_openTemplate.run(async (span) => {
            const amazonqApi = await getAmazonqApi()

            let hasChatAuth = false
            if (amazonqApi) {
                const authState = await amazonqApi.authApi.getChatAuthState()
                hasChatAuth = authState.codewhispererChat === 'connected' || authState.codewhispererChat === 'expired'
            }

            span.record({
                hasChatAuth,
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
