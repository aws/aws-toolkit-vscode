/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getTabSizeSetting } from '../shared/utilities/editorUtilities'
import { KeyStrokeHandler } from './service/keyStrokeHandler'
import * as EditorContext from './util/editorContext'
import { CodeWhispererConstants } from './models/constants'
import { getCompletionItems } from './service/completionProvider'
import { vsCodeState, ConfigurationEntry } from './models/model'
import { InlineCompletion } from './service/inlineCompletion'
import { invokeRecommendation } from './commands/invokeRecommendation'
import { onAcceptance } from './commands/onAcceptance'
import { resetIntelliSenseState } from './util/globalStateUtil'
import { CodeWhispererSettings } from './util/codewhispererSettings'
import { ExtContext } from '../shared/extensions'
import { TextEditorSelectionChangeKind } from 'vscode'
import * as telemetry from '../shared/telemetry/telemetry'
import { CodeWhispererTracker } from './tracker/codewhispererTracker'
import * as codewhispererClient from './client/codewhisperer'
import { runtimeLanguageContext } from './util/runtimeLanguageContext'
import { getLogger } from '../shared/logger'
import { isCloud9 } from '../shared/extensionUtilities'
import {
    enableCodeSuggestions,
    toggleCodeSuggestions,
    showIntroduction,
    showReferenceLog,
    set,
    get,
    enterAccessToken,
    requestAccess,
    showSecurityScan,
    requestAccessCloud9,
    updateCloud9TreeNodes,
} from './commands/basicCommands'
import { sleep } from '../shared/utilities/timeoutUtils'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'
import { SecurityPanelViewProvider } from './views/securityPanelViewProvider'
import { disposeSecurityDiagnostic } from './service/diagnosticsProvider'
import { RecommendationHandler } from './service/recommendationHandler'
import { Commands } from '../shared/vscode/commands2'

const performance = globalThis.performance ?? require('perf_hooks').performance

export async function activate(context: ExtContext): Promise<void> {
    const codewhispererSettings = CodeWhispererSettings.instance
    if (!codewhispererSettings.isEnabled()) {
        return
    }

    /**
     * Enable essential intellisense default settings for AWS C9 IDE
     */
    if (isCloud9()) {
        await enableDefaultConfig()
    }

    /**
     * CodeWhisperer security panel
     */
    const securityPanelViewProvider = new SecurityPanelViewProvider(context.extensionContext)
    activateSecurityScan()

    /**
     * Service control
     */
    const client = new codewhispererClient.DefaultCodeWhispererClient()

    const referenceHoverProvider = new ReferenceHoverProvider()
    const referenceLogViewProvider = new ReferenceLogViewProvider(
        context.extensionContext.extensionUri,
        codewhispererSettings
    )
    const referenceCodeLensProvider = new ReferenceInlineProvider()
    InlineCompletion.instance.setReferenceInlineProvider(referenceCodeLensProvider)

    context.extensionContext.subscriptions.push(
        /**
         * Configuration change
         */
        vscode.workspace.onDidChangeConfiguration(async configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('editor.tabSize')) {
                EditorContext.updateTabSize(getTabSizeSetting())
            }
            if (configurationChangeEvent.affectsConfiguration('aws.experiments')) {
                const codewhispererEnabled = await codewhispererSettings.isEnabled()
                if (!codewhispererEnabled) {
                    await set(CodeWhispererConstants.termsAcceptedKey, false, context)
                    await set(CodeWhispererConstants.autoTriggerEnabledKey, false, context)
                    if (!isCloud9()) {
                        InlineCompletion.instance.hideCodeWhispererStatusBar()
                    }
                }
                vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            }
            if (configurationChangeEvent.affectsConfiguration('aws.codeWhisperer')) {
                referenceLogViewProvider.update()
            }
        }),
        /**
         * Accept terms of service
         */
        Commands.register('aws.codeWhisperer.acceptTermsOfService', async () => {
            await set(CodeWhispererConstants.autoTriggerEnabledKey, true, context)
            await set(CodeWhispererConstants.termsAcceptedKey, true, context)
            await vscode.commands.executeCommand('setContext', CodeWhispererConstants.termsAcceptedKey, true)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')

            const isShow = get(CodeWhispererConstants.welcomeMessageKey, context)
            if (!isShow) {
                showCodeWhispererWelcomeMessage()
                await set(CodeWhispererConstants.welcomeMessageKey, true, context)
            }

            if (!isCloud9()) {
                InlineCompletion.instance.setCodeWhispererStatusBarOk()
            }
        }),
        /**
         * Cancel terms of service
         */
        Commands.register('aws.codeWhisperer.cancelTermsOfService', async () => {
            await set(CodeWhispererConstants.autoTriggerEnabledKey, false, context)
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        }),
        /**
         * Open Configuration
         */
        Commands.register('aws.codeWhisperer.configure', async id => {
            if (id === 'codewhisperer') {
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    `@id:aws.codeWhisperer.includeSuggestionsWithCodeReferences`
                )
            } else {
                await vscode.commands.executeCommand('workbench.action.openSettings', `@id:aws.experiments`)
            }
        }),
        // show introduction
        showIntroduction.register(context),
        // toggle code suggestions
        toggleCodeSuggestions.register(context),
        // enable code suggestions
        enableCodeSuggestions.register(context),
        // enter access token
        enterAccessToken.register(context, client),
        // request access
        requestAccess.register(context),
        // code scan
        showSecurityScan.register(context, securityPanelViewProvider, client),
        // manual trigger
        Commands.register({ id: 'aws.codeWhisperer', autoconnect: true }, async () => {
            invokeRecommendation(vscode.window.activeTextEditor as vscode.TextEditor, client, await getConfigEntry())
        }),
        /**
         * On recommendation acceptance
         */
        Commands.register(
            'aws.codeWhisperer.accept',
            async (
                range: vscode.Range,
                acceptIndex: number,
                recommendation: string,
                requestId: string,
                sessionId: string,
                triggerType: telemetry.CodewhispererTriggerType,
                completionType: telemetry.CodewhispererCompletionType,
                language: telemetry.CodewhispererLanguage,
                references: codewhispererClient.References
            ) => {
                const bracketConfiguration = vscode.workspace.getConfiguration('editor').get('autoClosingBrackets')
                const isAutoClosingBracketsEnabled: boolean = bracketConfiguration !== 'never' ? true : false
                const editor = vscode.window.activeTextEditor
                await onAcceptance(
                    {
                        editor,
                        range,
                        acceptIndex,
                        recommendation,
                        requestId,
                        sessionId,
                        triggerType,
                        completionType,
                        language,
                        references,
                    },
                    isAutoClosingBracketsEnabled,
                    context.extensionContext.globalState
                )
                if (references != undefined && editor != undefined) {
                    const referenceLog = ReferenceLogViewProvider.getReferenceLog(recommendation, references, editor)
                    referenceLogViewProvider.addReferenceLog(referenceLog)
                    referenceHoverProvider.addCodeReferences(recommendation, references)
                }
            }
        ),
        // on text document close.
        vscode.workspace.onDidCloseTextDocument(e => {
            RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(vscode.window.activeTextEditor, -1)
            RecommendationHandler.instance.clearRecommendations()
        }),

        vscode.languages.registerHoverProvider(CodeWhispererConstants.supportedLanguages, referenceHoverProvider),
        vscode.window.registerWebviewViewProvider(ReferenceLogViewProvider.viewType, referenceLogViewProvider),
        showReferenceLog.register(context),
        vscode.languages.registerCodeLensProvider(CodeWhispererConstants.supportedLanguages, referenceCodeLensProvider)
    )

    function activateSecurityScan() {
        context.extensionContext.subscriptions.push(
            vscode.window.registerWebviewViewProvider(SecurityPanelViewProvider.viewType, securityPanelViewProvider)
        )

        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (isCloud9()) {
                    if (editor) {
                        securityPanelViewProvider.setDecoration(editor, editor.document.uri)
                    }
                }
            })
        )
    }

    async function showCodeWhispererWelcomeMessage(): Promise<void> {
        const filePath = isCloud9()
            ? context.extensionContext.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererCloud9ReadmeFileSource)
            : context.extensionContext.asAbsolutePath(CodeWhispererConstants.welcomeCodeWhispererReadmeFileSource)
        const readmeUri = vscode.Uri.file(filePath)
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    }

    async function getManualTriggerStatus(): Promise<boolean> {
        const codewhispererEnabled = await codewhispererSettings.isEnabled()
        const acceptedTerms: boolean =
            context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.termsAcceptedKey) || false
        return acceptedTerms && codewhispererEnabled
    }

    function getAutoTriggerStatus(): boolean {
        return context.extensionContext.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false
    }

    async function getConfigEntry(): Promise<ConfigurationEntry> {
        const isShowMethodsEnabled: boolean =
            vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
        const isAutomatedTriggerEnabled: boolean = getAutoTriggerStatus()
        const isManualTriggerEnabled: boolean = await getManualTriggerStatus()
        const isIncludeSuggestionsWithCodeReferencesEnabled =
            codewhispererSettings.isIncludeSuggestionsWithCodeReferencesEnabled()
        return {
            isShowMethodsEnabled,
            isManualTriggerEnabled,
            isAutomatedTriggerEnabled,
            isIncludeSuggestionsWithCodeReferencesEnabled,
        }
    }

    if (isCloud9()) {
        setSubscriptionsforCloud9()
        updateCloud9TreeNodes.execute()
    } else {
        await setSubscriptionsforVsCodeInline()
    }

    async function setSubscriptionsforVsCodeInline() {
        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async e => {
                /**
                 * CodeWhisperer security panel dynamic handling
                 */
                if (e.document === vscode.window.activeTextEditor?.document) {
                    if (isCloud9()) {
                        securityPanelViewProvider.disposeSecurityPanelItem(e, vscode.window.activeTextEditor)
                    } else {
                        disposeSecurityDiagnostic(e)
                    }
                }

                /**
                 * Handle this keystroke event only when
                 * 1. It is in current non plaintext active editor
                 * 2. It is not a backspace
                 * 3. It is not caused by CodeWhisperer editing
                 * 4. It is not from undo/redo.
                 */
                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.convertLanguage(e.document.languageId) !== 'plaintext' &&
                    e.contentChanges.length != 0 &&
                    !vsCodeState.isCodeWhispererEditing &&
                    !JSON.stringify(e).includes('reason')
                ) {
                    vsCodeState.lastUserModificationTime = performance.now()
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
                    if (InlineCompletion.instance.getIsActive) {
                        await InlineCompletion.instance.setTypeAheadRecommendations(vscode.window.activeTextEditor, e)
                    } else {
                        await KeyStrokeHandler.instance.processKeyStroke(
                            e,
                            vscode.window.activeTextEditor,
                            client,
                            await getConfigEntry()
                        )
                    }
                }
            }),

            /**
             * On recommendation rejection
             */
            vscode.window.onDidChangeVisibleTextEditors(async e => {
                await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor, false, true)
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor)
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse && vscode.window.activeTextEditor) {
                    await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor)
                }
            }),
            Commands.register('aws.codeWhisperer.rejectCodeSuggestion', async e => {
                if (vscode.window.activeTextEditor)
                    await InlineCompletion.instance.rejectRecommendation(vscode.window.activeTextEditor)
            }),
            /**
             * Recommendation navigation
             */
            Commands.register('aws.codeWhisperer.nextCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor)
                    InlineCompletion.instance.navigateRecommendation(vscode.window.activeTextEditor, true)
            }),
            Commands.register('aws.codeWhisperer.previousCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor)
                    InlineCompletion.instance.navigateRecommendation(vscode.window.activeTextEditor, false)
            }),
            /**
             * Recommendation acceptance
             */
            Commands.register('aws.codeWhisperer.acceptCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor)
                    await InlineCompletion.instance.acceptRecommendation(vscode.window.activeTextEditor)
            })
        )
        // If the vscode is refreshed we need to maintain the status bar
        const acceptedTermsAndEnabledCodeWhisperer: boolean = await getManualTriggerStatus()
        if (acceptedTermsAndEnabledCodeWhisperer) {
            InlineCompletion.instance.setCodeWhispererStatusBarOk()
        }
    }

    function setSubscriptionsforCloud9() {
        /**
         * Manual trigger
         */
        context.extensionContext.subscriptions.push(
            // request access C9
            requestAccessCloud9.register(context),
            updateCloud9TreeNodes.register(context),
            vscode.languages.registerCompletionItemProvider(CodeWhispererConstants.supportedLanguages, {
                async provideCompletionItems(
                    document: vscode.TextDocument,
                    position: vscode.Position,
                    token: vscode.CancellationToken,
                    context: vscode.CompletionContext
                ) {
                    const completionList = new vscode.CompletionList(getCompletionItems(document, position), false)
                    return completionList
                },
            }),
            /**
             * Automated trigger
             */
            vscode.workspace.onDidChangeTextDocument(async e => {
                /**
                 * CodeWhisperer security panel dynamic handling
                 */
                if (e.document === vscode.window.activeTextEditor?.document) {
                    if (isCloud9()) {
                        securityPanelViewProvider.disposeSecurityPanelItem(e, vscode.window.activeTextEditor)
                    } else {
                        disposeSecurityDiagnostic(e)
                    }
                }

                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.convertLanguage(e.document.languageId) !== 'plaintext' &&
                    e.contentChanges.length != 0 &&
                    !vsCodeState.isCodeWhispererEditing
                ) {
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
                    await KeyStrokeHandler.instance.processKeyStroke(
                        e,
                        vscode.window.activeTextEditor,
                        client,
                        await getConfigEntry()
                    )
                }
            }),

            /**
             * On intelliSense recommendation rejection, reset set intelli sense is active state
             * Maintaining this variable because VS Code does not expose official intelliSense isActive API
             */
            vscode.window.onDidChangeVisibleTextEditors(async e => {
                resetIntelliSenseState(
                    await getManualTriggerStatus(),
                    getAutoTriggerStatus(),
                    RecommendationHandler.instance.isValidResponse()
                )
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                resetIntelliSenseState(
                    await getManualTriggerStatus(),
                    getAutoTriggerStatus(),
                    RecommendationHandler.instance.isValidResponse()
                )
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse) {
                    resetIntelliSenseState(
                        await getManualTriggerStatus(),
                        getAutoTriggerStatus(),
                        RecommendationHandler.instance.isValidResponse()
                    )
                }
            }),
            vscode.workspace.onDidSaveTextDocument(async e => {
                resetIntelliSenseState(
                    await getManualTriggerStatus(),
                    getAutoTriggerStatus(),
                    RecommendationHandler.instance.isValidResponse()
                )
            })
        )
    }
}

export async function shutdown() {
    RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(vscode.window.activeTextEditor, -1)
    CodeWhispererTracker.getTracker().shutdown()
}

export async function enableDefaultConfig() {
    const editorSettings = vscode.workspace.getConfiguration('editor')
    try {
        await editorSettings.update('suggest.showMethods', true, vscode.ConfigurationTarget.Global)
        // suggest.preview is available in vsc 1.57+
        await editorSettings.update('suggest.preview', true, vscode.ConfigurationTarget.Global)
        await editorSettings.update('acceptSuggestionOnEnter', 'on', vscode.ConfigurationTarget.Global)
        await editorSettings.update('snippetSuggestions', 'top', vscode.ConfigurationTarget.Global)
    } catch (error) {
        getLogger().error('codewhisperer: Failed to update user settings', error)
    }
}
