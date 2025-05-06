/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import {
    AuthUtil,
    CodeWhispererConstants,
    isInlineCompletionEnabled,
    runtimeLanguageContext,
    TelemetryHelper,
    UserWrittenCodeTracker,
    vsCodeState,
} from 'aws-core-vscode/codewhisperer'
import { globals, sleep } from 'aws-core-vscode/shared'

export async function activate() {
    if (isInlineCompletionEnabled()) {
        await setSubscriptionsforInlineCompletion()
        await AuthUtil.instance.setVscodeContextProps()
    }

    async function setSubscriptionsforInlineCompletion() {
        /**
         * Automated trigger
         */
        globals.context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return
                }
                if (e.document !== editor.document) {
                    return
                }
                if (!runtimeLanguageContext.isLanguageSupported(e.document)) {
                    return
                }

                UserWrittenCodeTracker.instance.onTextDocumentChange(e)
                /**
                 * Handle this keystroke event only when
                 * 1. It is not a backspace
                 * 2. It is not caused by CodeWhisperer editing
                 * 3. It is not from undo/redo.
                 */
                if (e.contentChanges.length === 0 || vsCodeState.isCodeWhispererEditing) {
                    return
                }

                if (vsCodeState.lastUserModificationTime) {
                    TelemetryHelper.instance.setTimeSinceLastModification(
                        performance.now() - vsCodeState.lastUserModificationTime
                    )
                }
                vsCodeState.lastUserModificationTime = performance.now()
                /**
                 * Important:  Doing this sleep(10) is to make sure
                 * 1. this event is processed by vs code first
                 * 2. editor.selection.active has been successfully updated by VS Code
                 * Then this event can be processed by our code.
                 */
                await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
            })
        )
    }
}
