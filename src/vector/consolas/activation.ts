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
import { invocationContext } from './models/model'
import {
    showNextRecommendation,
    showPreviousRecommendation,
    rejectRecommendation,
    acceptRecommendation,
    setContextAndTrigger,
    setTypeAheadRecommendations,
} from './service/inlinecompletionProvider'
import { invokeConsolas } from './commands/invokeConsolas'
import { onAcceptance } from './commands/onAcceptance'
import { TelemetryHelper } from './util/telemetryHelper'
import { onRejection } from './commands/onRejection'
import { ConsolasSettings } from './util/consolasSettings'
import { activate as activateView } from './vue/backend'
import { ExtContext } from '../../shared/extensions'
import { Settings } from '../../shared/settings'
import { TextEditorSelectionChangeKind } from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { ConsolasTracker } from './tracker/consolasTracker'
import * as consolasClient from './client/consolas'
import { runtimeLanguageContext } from './util/runtimeLanguageContext'
import { getLogger } from '../../shared/logger'
import { isCloud9 } from '../../shared/extensionUtilities'

export async function activate(context: ExtContext, configuration: Settings): Promise<void> {
    /**
     * Enable essential intellisense default settings
     */
    await enableDefaultConfig()
    await runtimeLanguageContext.initLanguageRuntimeContexts()
    /**
     * Service control
     */
    const consolasSettings = new ConsolasSettings(configuration)
    const isManualTriggerEnabled: boolean = await getManualTriggerStatus()
    const isAutomatedTriggerEnabled: boolean =
        context.extensionContext.globalState.get<boolean>(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY) || false
    const client = new consolasClient.DefaultConsolasClient()
    context.extensionContext.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('editor.tabSize')) {
                EditorContext.updateTabSize(getTabSizeSetting())
            }
            if (configurationChangeEvent.affectsConfiguration('aws.experiments')) {
                const consolasEnabled = await consolasSettings.isEnabled()
                if (!consolasEnabled) {
                    set(ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY, false)
                    set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, false)
                }
                vscode.commands.executeCommand('aws.refreshAwsExplorer')
            }
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.pauseCodeSuggestion', async () => {
            const autoTriggerEnabled: boolean =
                context.extensionContext.globalState.get<boolean>(
                    ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY
                ) || false
            set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, !autoTriggerEnabled)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer')
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.resumeCodeSuggestion', async () => {
            const autoTriggerEnabled: boolean =
                context.extensionContext.globalState.get<boolean>(
                    ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY
                ) || false
            set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, !autoTriggerEnabled)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer')
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.acceptTermsAndConditions', async () => {
            set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, true)
            set(ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY, true)
            await vscode.commands.executeCommand('setContext', ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY, true)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer')
            /**
             *  TODO Beta landing page removes in GA state
             */
            const isShow = get(ConsolasConstants.CONSOLAS_WELCOME_MESSAGE_KEY)
            if (!isShow) {
                showConsolasWelcomeMessage()
                set(ConsolasConstants.CONSOLAS_WELCOME_MESSAGE_KEY, true)
            }
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.cancelTermsAndConditions', async () => {
            set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, false)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer')
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.configure', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', `@id:aws.experiments`)
        }),
        vscode.commands.registerCommand('aws.consolas.introduction', async () => {
            vscode.env.openExternal(vscode.Uri.parse(ConsolasConstants.CONSOLAS_LEARN_MORE_URI))
        })
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas', async () => {
            const isShowMethodsOn: boolean =
                vscode.workspace.getConfiguration('editor').get('suggest.showMethods') || false
            const isAutomatedTriggerOn: boolean =
                context.extensionContext.globalState.get<boolean>(
                    ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY
                ) || false
            const isManualTriggerOn: boolean = await getManualTriggerStatus()
            invokeConsolas(
                vscode.window.activeTextEditor as vscode.TextEditor,
                client,
                isShowMethodsOn,
                isManualTriggerOn,
                isAutomatedTriggerOn
            )
        })
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.enabledCodeSuggestions', () => {
            activateView(context)
        })
    )

    /**
     * On recommendation acceptance
     */
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.consolas.accept',
            async (
                range: vscode.Range,
                acceptIndex: number,
                recommendation: string,
                requestId: string,
                triggerType: telemetry.ConsolasTriggerType,
                completionType: telemetry.ConsolasCompletionType,
                language: telemetry.ConsolasLanguage
            ) => {
                const bracketConfiguration = vscode.workspace.getConfiguration('editor').get('autoClosingBrackets')
                const isAutoClosingBracketsEnabled: boolean = bracketConfiguration !== 'never' ? true : false
                const editor = vscode.window.activeTextEditor
                onAcceptance(
                    {
                        editor,
                        range,
                        acceptIndex,
                        recommendation,
                        requestId,
                        triggerType,
                        completionType,
                        language,
                    },
                    isAutoClosingBracketsEnabled,
                    context.extensionContext.globalState
                )
            }
        )
    )

    async function showConsolasWelcomeMessage(): Promise<void> {
        const filePath = context.extensionContext.asAbsolutePath(ConsolasConstants.WELCOME_CONSOLAS_README_FILE_SOURCE)
        const readmeUri = vscode.Uri.file(filePath)
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    }

    context.extensionContext.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(e => {
            TelemetryHelper.recordUserDecisionTelemetry(-1, vscode.window.activeTextEditor?.document.languageId)
        })
    )

    function get(key: string): string | undefined {
        return context.extensionContext.globalState.get(key)
    }

    function set(key: string, value: any): void {
        context.extensionContext.globalState.update(key, value).then(
            () => {},
            error => {
                getLogger().verbose(`Failed to update global state: ${error}`)
            }
        )
    }

    async function getManualTriggerStatus(): Promise<boolean> {
        const consolasEnabled = await consolasSettings.isEnabled()
        const acceptedTerms: boolean =
            context.extensionContext.globalState.get<boolean>(ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY) || false
        return acceptedTerms && consolasEnabled
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
                    e.contentChanges.length != 0
                ) {
                    if (!invocationContext.isInlineActive) {
                        setTypeAheadRecommendations(vscode.window.activeTextEditor, e)
                    }
                    const isAutoTriggerOn: boolean =
                        context.extensionContext.globalState.get<boolean>(
                            ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY
                        ) || false
                    await KeyStrokeHandler.processKeyStroke(
                        e,
                        vscode.window.activeTextEditor,
                        client,
                        isManualTriggerEnabled,
                        isAutoTriggerOn
                    )
                }
            })
        )
        /**
         * On recommendation rejection
         */
        context.extensionContext.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async e => {
                if (!invocationContext.isInlineActive) await rejectRecommendation(vscode.window.activeTextEditor)
            })
        )
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeVisibleTextEditors(async e => {
                if (!invocationContext.isInlineActive) await rejectRecommendation(vscode.window.activeTextEditor)
            })
        )
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(async e => {
                if (!invocationContext.isInlineActive) await rejectRecommendation(vscode.window.activeTextEditor)
            })
        )
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection(async e => {
                if (
                    e.kind === TextEditorSelectionChangeKind.Mouse &&
                    context?.extensionContext.globalState.get(ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY) &&
                    !invocationContext.isInlineActive &&
                    vscode.window.activeTextEditor
                ) {
                    await rejectRecommendation(vscode.window.activeTextEditor)
                }
            })
        )

        context.extensionContext.subscriptions.push(
            vscode.commands.registerCommand('aws.consolas.nextCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) showNextRecommendation(vscode.window.activeTextEditor)
            })
        )

        context.extensionContext.subscriptions.push(
            vscode.commands.registerCommand('aws.consolas.previousCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) showPreviousRecommendation(vscode.window.activeTextEditor)
            })
        )

        context.extensionContext.subscriptions.push(
            vscode.commands.registerCommand('aws.consolas.acceptCodeSuggestion', async () => {
                if (vscode.window.activeTextEditor) await acceptRecommendation(vscode.window.activeTextEditor)
            })
        )

        context.extensionContext.subscriptions.push(
            vscode.commands.registerCommand('aws.consolas.rejectCodeSuggestion', async e => {
                if (vscode.window.activeTextEditor) await rejectRecommendation(vscode.window.activeTextEditor)
            })
        )
        setContextAndTrigger(context, isManualTriggerEnabled, isAutomatedTriggerEnabled)
    }

    if (isCloud9()) {
        setSubscriptionsforCloud9()
    } else {
        setSubscriptionsforVsCodeInline()
    }

    function setSubscriptionsforCloud9() {
        /**
         * Manual trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(ConsolasConstants.SUPPORTED_LANGUAGES, {
                async provideCompletionItems(
                    document: vscode.TextDocument,
                    position: vscode.Position,
                    token: vscode.CancellationToken,
                    context: vscode.CompletionContext
                ) {
                    const completionList = new vscode.CompletionList(getCompletionItems(document, position), false)
                    return completionList
                },
            })
        )

        /**
         * Automated trigger
         */
        context.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (
                    e.document === vscode.window.activeTextEditor?.document &&
                    runtimeLanguageContext.convertLanguage(e.document.languageId) !== 'plaintext' &&
                    e.contentChanges.length != 0
                ) {
                    const isAutoTriggerOn: boolean =
                        context.extensionContext.globalState.get<boolean>(
                            ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY
                        ) || false
                    KeyStrokeHandler.processKeyStroke(
                        e,
                        vscode.window.activeTextEditor,
                        client,
                        isManualTriggerEnabled,
                        isAutoTriggerOn
                    )
                }
            })
        )

        /**
         * On recommendation rejection
         */
        context.extensionContext.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(e => {
                onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
            })
        )
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeVisibleTextEditors(e => {
                onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
            })
        )
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(e => {
                onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
            })
        )
        context.extensionContext.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection(e => {
                if (e.kind === TextEditorSelectionChangeKind.Mouse) {
                    onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
                }
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
