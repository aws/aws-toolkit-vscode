/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import * as KeyStrokeHandler from './service/keyStrokeHandler'
import * as EditorContext from './util/editorContext'
import { ConsolasConstants } from './models/constants'
import { getCompletionItems } from './service/completionProvider'
import { invocationContext, ConfigurationEntry } from './models/model'
import {
    navigateRecommendation,
    rejectRecommendation,
    acceptRecommendation,
    setTypeAheadRecommendations,
    setReferenceInlineProvider,
} from './service/inlineCompletion'
import { invokeConsolas } from './commands/invokeConsolas'
import { onAcceptance } from './commands/onAcceptance'
import { TelemetryHelper } from './util/telemetryHelper'
import { resetIntelliSenseState } from './util/globalStateUtil'
import { ConsolasSettings } from './util/consolasSettings'
import { ExtContext } from '../../shared/extensions'
import { Settings } from '../../shared/settings'
import { TextEditorSelectionChangeKind } from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { ConsolasTracker } from './tracker/consolasTracker'
import * as consolasClient from './client/consolas'
import { runtimeLanguageContext } from './util/runtimeLanguageContext'
import { getLogger } from '../../shared/logger'
import { isCloud9 } from '../../shared/extensionUtilities'
import {
    enableCodeSuggestions,
    toggleCodeSuggestions,
    showIntroduction,
    showReferenceLog,
    set,
    get,
} from './commands/basicCommands'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
import { ReferenceHoverProvider } from './service/referenceHoverProvider'
import { ReferenceInlineProvider } from './service/referenceInlineProvider'

export async function activate(context: ExtContext, configuration: Settings): Promise<void> {
    /**
     * Enable essential intellisense default settings
     */
    await enableDefaultConfig()
    await runtimeLanguageContext.initLanguageRuntimeContexts()
    /**
     * Service control
     */
    const consolasSettings = ConsolasSettings.instance
    const client = new consolasClient.DefaultConsolasClient()

    // Origin tracker reference Hover provider, Reference Log Channel.
    const referenceHoverProvider = new ReferenceHoverProvider()
    const referenceLogViewProvider = new ReferenceLogViewProvider(
        context.extensionContext.extensionUri,
        consolasSettings
    )
    const referenceCodeLensProvider = new ReferenceInlineProvider()
    setReferenceInlineProvider(referenceCodeLensProvider)

    context.extensionContext.subscriptions.push(
        /**
         * Configuration change
         */
        vscode.workspace.onDidChangeConfiguration(async configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('editor.tabSize')) {
                EditorContext.updateTabSize(getTabSizeSetting())
            }
            if (configurationChangeEvent.affectsConfiguration('aws.experiments')) {
                const consolasEnabled = await consolasSettings.isEnabled()
                if (!consolasEnabled) {
                    set(ConsolasConstants.termsAcceptedKey, false, context)
                    set(ConsolasConstants.autoTriggerEnabledKey, false, context)
                }
                vscode.commands.executeCommand('aws.consolas.refresh')
            }
            if (configurationChangeEvent.affectsConfiguration('aws.consolas')) {
                referenceLogViewProvider.update()
            }
        }),
        /**
         * Accept terms of service
         */
        vscode.commands.registerCommand('aws.consolas.acceptTermsOfService', async () => {
            set(ConsolasConstants.autoTriggerEnabledKey, true, context)
            set(ConsolasConstants.termsAcceptedKey, true, context)
            await vscode.commands.executeCommand('setContext', ConsolasConstants.termsAcceptedKey, true)
            await vscode.commands.executeCommand('aws.consolas.refresh')
            /**
             *  TODO Beta landing page removes in GA state
             */
            const isShow = get(ConsolasConstants.welcomeMessageKey, context)
            if (!isShow) {
                showConsolasWelcomeMessage()
                set(ConsolasConstants.welcomeMessageKey, true, context)
            }
        }),
        /**
         * Cancel terms of service
         */
        vscode.commands.registerCommand('aws.consolas.cancelTermsOfService', async () => {
            set(ConsolasConstants.autoTriggerEnabledKey, false, context)
            await vscode.commands.executeCommand('aws.consolas.refresh')
        }),
        /**
         * Open Configuration
         */
        vscode.commands.registerCommand('aws.consolas.configure', async id => {
            if (id === 'consolas') {
                await vscode.commands.executeCommand('workbench.action.openSettings', `@id:aws.consolas`)
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
        // manual trigger
        vscode.commands.registerCommand('aws.consolas', async () => {
            invokeConsolas(vscode.window.activeTextEditor as vscode.TextEditor, client, await getConfigEntry())
        }),
        /**
         * On recommendation acceptance
         */
        vscode.commands.registerCommand(
            'aws.consolas.accept',
            async (
                range: vscode.Range,
                acceptIndex: number,
                recommendation: string,
                requestId: string,
                triggerType: telemetry.ConsolasTriggerType,
                completionType: telemetry.ConsolasCompletionType,
                language: telemetry.ConsolasLanguage,
                references: consolasClient.References
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
                    referenceHoverProvider.addLicensedCode(recommendation, references)
                }
            }
        ),
        // on text document close.
        vscode.workspace.onDidCloseTextDocument(e => {
            TelemetryHelper.recordUserDecisionTelemetry(-1, vscode.window.activeTextEditor?.document.languageId)
        }),
        // origin tracker related providers
        vscode.languages.registerHoverProvider(ConsolasConstants.supportedLanguages, referenceHoverProvider),
        vscode.window.registerWebviewViewProvider(ReferenceLogViewProvider.viewType, referenceLogViewProvider),
        showReferenceLog.register(context),
        vscode.languages.registerCodeLensProvider(ConsolasConstants.supportedLanguages, referenceCodeLensProvider)
    )

    async function showConsolasWelcomeMessage(): Promise<void> {
        const filePath = context.extensionContext.asAbsolutePath(ConsolasConstants.welcomeConsolasReadmeFileSource)
        const readmeUri = vscode.Uri.file(filePath)
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    }

    async function getManualTriggerStatus(): Promise<boolean> {
        const consolasEnabled = await consolasSettings.isEnabled()
        const acceptedTerms: boolean =
            context.extensionContext.globalState.get<boolean>(ConsolasConstants.termsAcceptedKey) || false
        return acceptedTerms && consolasEnabled
    }

    function getAutoTriggerStatus(): boolean {
        return context.extensionContext.globalState.get<boolean>(ConsolasConstants.autoTriggerEnabledKey) || false
    }

    async function getConfigEntry(): Promise<ConfigurationEntry> {
        const isShowMethodsEnabled: boolean =
            vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
        const isAutomatedTriggerEnabled: boolean = getAutoTriggerStatus()
        const isManualTriggerEnabled: boolean = await getManualTriggerStatus()
        const isIncludeSuggestionsWithCodeReferencesEnabled =
            consolasSettings.isIncludeSuggestionsWithCodeReferencesEnabled()
        return {
            isShowMethodsEnabled,
            isManualTriggerEnabled,
            isAutomatedTriggerEnabled,
            isIncludeSuggestionsWithCodeReferencesEnabled,
        }
    }

    if (isCloud9()) {
        setSubscriptionsforCloud9()
    } else {
        setSubscriptionsforVsCodeInline()
    }

    function setSubscriptionsforVsCodeInline() {
        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async e => {
                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.convertLanguage(e.document.languageId) !== 'plaintext' &&
                    e.contentChanges.length != 0 &&
                    !invocationContext.isConsolasEditing
                ) {
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(10)
                    await setTypeAheadRecommendations(vscode.window.activeTextEditor, e)
                    await KeyStrokeHandler.processKeyStroke(
                        e,
                        vscode.window.activeTextEditor,
                        client,
                        await getConfigEntry()
                    )
                }
            }),

            /**
             * On recommendation rejection
             */
            vscode.window.onDidChangeVisibleTextEditors(async e => {
                await rejectRecommendation(vscode.window.activeTextEditor)
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                await rejectRecommendation(vscode.window.activeTextEditor)
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse && vscode.window.activeTextEditor) {
                    await rejectRecommendation(vscode.window.activeTextEditor)
                }
            }),
            vscode.commands.registerCommand('aws.consolas.rejectCodeSuggestion', async e => {
                if (vscode.window.activeTextEditor) await rejectRecommendation(vscode.window.activeTextEditor)
            }),
            /**
             * Recommendation navigation
             */
            vscode.commands.registerCommand('aws.consolas.nextCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) navigateRecommendation(vscode.window.activeTextEditor, true)
            }),
            vscode.commands.registerCommand('aws.consolas.previousCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) navigateRecommendation(vscode.window.activeTextEditor, false)
            }),
            /**
             * Recommendation acceptance
             */
            vscode.commands.registerCommand('aws.consolas.acceptCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) await acceptRecommendation(vscode.window.activeTextEditor)
            })
        )
    }

    function setSubscriptionsforCloud9() {
        /**
         * Manual trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(ConsolasConstants.supportedLanguages, {
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
                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.convertLanguage(e.document.languageId) !== 'plaintext' &&
                    e.contentChanges.length != 0 &&
                    !invocationContext.isConsolasEditing
                ) {
                    /**
                     * Important:  Doing this sleep(10) is to make sure
                     * 1. this event is processed by vs code first
                     * 2. editor.selection.active has been successfully updated by VS Code
                     * Then this event can be processed by our code.
                     */
                    await sleep(10)
                    await KeyStrokeHandler.processKeyStroke(
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
                resetIntelliSenseState(await getManualTriggerStatus(), getAutoTriggerStatus())
            }),
            vscode.window.onDidChangeActiveTextEditor(async e => {
                resetIntelliSenseState(await getManualTriggerStatus(), getAutoTriggerStatus())
            }),
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse) {
                    resetIntelliSenseState(await getManualTriggerStatus(), getAutoTriggerStatus())
                }
            }),
            vscode.workspace.onDidSaveTextDocument(async e => {
                resetIntelliSenseState(await getManualTriggerStatus(), getAutoTriggerStatus())
            })
        )
    }
}

export async function shutdown() {
    TelemetryHelper.recordUserDecisionTelemetry(-1, vscode.window.activeTextEditor?.document.languageId)
    ConsolasTracker.getTracker().shutdown()
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
        getLogger().error('consolas: Failed to update user settings', error)
    }
}
