/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import {
    AuthUtil,
    CodeSuggestionsState,
    CodeWhispererCodeCoverageTracker,
    CodeWhispererConstants,
    CodeWhispererSettings,
    ConfigurationEntry,
    DefaultCodeWhispererClient,
    invokeRecommendation,
    isInlineCompletionEnabled,
    KeyStrokeHandler,
    RecommendationHandler,
    runtimeLanguageContext,
    TelemetryHelper,
    UserWrittenCodeTracker,
    vsCodeState,
} from 'aws-core-vscode/codewhisperer'
import { Commands, getLogger, globals, sleep } from 'aws-core-vscode/shared'

export async function activate() {
    const codewhispererSettings = CodeWhispererSettings.instance
    const client = new DefaultCodeWhispererClient()

    if (isInlineCompletionEnabled()) {
        await setSubscriptionsforInlineCompletion()
        await AuthUtil.instance.setVscodeContextProps()
    }

    function getAutoTriggerStatus(): boolean {
        return CodeSuggestionsState.instance.isSuggestionsEnabled()
    }

    async function getConfigEntry(): Promise<ConfigurationEntry> {
        const isShowMethodsEnabled: boolean =
            vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
        const isAutomatedTriggerEnabled: boolean = getAutoTriggerStatus()
        const isManualTriggerEnabled: boolean = true
        const isSuggestionsWithCodeReferencesEnabled = codewhispererSettings.isSuggestionsWithCodeReferencesEnabled()

        // TODO:remove isManualTriggerEnabled
        return {
            isShowMethodsEnabled,
            isManualTriggerEnabled,
            isAutomatedTriggerEnabled,
            isSuggestionsWithCodeReferencesEnabled,
        }
    }

    async function setSubscriptionsforInlineCompletion() {
        RecommendationHandler.instance.subscribeSuggestionCommands()

        /**
         * Automated trigger
         */
        globals.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(async (editor) => {
                await RecommendationHandler.instance.onEditorChange()
            }),
            vscode.window.onDidChangeWindowState(async (e) => {
                await RecommendationHandler.instance.onFocusChange()
            }),
            vscode.window.onDidChangeTextEditorSelection(async (e) => {
                await RecommendationHandler.instance.onCursorChange(e)
            }),
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

                CodeWhispererCodeCoverageTracker.getTracker(e.document.languageId)?.countTotalTokens(e)
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
                if (!RecommendationHandler.instance.isSuggestionVisible()) {
                    await KeyStrokeHandler.instance.processKeyStroke(e, editor, client, await getConfigEntry())
                }
            }),
            // manual trigger
            Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
                invokeRecommendation(
                    vscode.window.activeTextEditor as vscode.TextEditor,
                    client,
                    await getConfigEntry()
                ).catch((e) => {
                    getLogger().error('invokeRecommendation failed: %s', (e as Error).message)
                })
            })
        )
    }
}
