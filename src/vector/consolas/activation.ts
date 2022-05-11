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
import { invokeConsolas } from './commands/invokeConsolas'
import { onAcceptance } from './commands/onAcceptance'
import { TelemetryHelper } from './util/telemetryHelper'
import { onRejection } from './commands/onRejection'
import { ConsolasSettings } from './util/consolasSettings'
import { ExtContext } from '../../shared/extensions'
import { Settings } from '../../shared/settings'
import { TextEditorSelectionChangeKind } from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { ConsolasTracker } from './tracker/consolasTracker'
import * as consolasClient from './client/consolas'
import { runtimeLanguageContext } from './util/runtimeLanguageContext'
import { getLogger } from '../../shared/logger'
import { enableCodeSuggestions, toggleCodeSuggestions, showIntroduction } from './commands/treeNodeCommands'

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
                    set(ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY, false, context)
                    set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, false, context)
                }
                vscode.commands.executeCommand('aws.refreshAwsExplorer')
            }
        })
    )
    context.extensionContext.subscriptions.push(toggleCodeSuggestions.register(context))
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.acceptTermsAndConditions', async () => {
            set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, true, context)
            set(ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY, true, context)
            await vscode.commands.executeCommand('setContext', ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY, true)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer')
            /**
             *  TODO Beta landing page removes in GA state
             */
            const isShow = get(ConsolasConstants.CONSOLAS_WELCOME_MESSAGE_KEY, context)
            if (!isShow) {
                showConsolasWelcomeMessage()
                set(ConsolasConstants.CONSOLAS_WELCOME_MESSAGE_KEY, true, context)
            }
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.cancelTermsAndConditions', async () => {
            set(ConsolasConstants.CONSOLAS_AUTO_TRIGGER_ENABLED_KEY, false, context)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer')
        })
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.consolas.configure', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', `@id:aws.experiments`)
        }),
        showIntroduction.register(context)
    )

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
    context.extensionContext.subscriptions.push(enableCodeSuggestions.register(context))

    /**
     * On recommendation acceptance
     */
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.consolas.accept',
            async (
                line: number,
                acceptIndex: number,
                recommendation: string,
                requestId: string,
                triggerType: telemetry.ConsolasTriggerType,
                completionType: telemetry.ConsolasCompletionType,
                language: telemetry.ConsolasLanguage
            ) => {
                const isAutoClosingBracketsEnabled: boolean =
                    vscode.workspace.getConfiguration('editor').get('autoClosingBrackets') || false
                const editor = vscode.window.activeTextEditor
                onAcceptance(
                    {
                        editor,
                        line,
                        acceptIndex,
                        recommendation,
                        requestId,
                        triggerType,
                        completionType,
                        language,
                    },
                    isAutoClosingBracketsEnabled
                )
            }
        )
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

    async function getManualTriggerStatus(): Promise<boolean> {
        const consolasEnabled = await consolasSettings.isEnabled()
        const acceptedTerms: boolean =
            context.extensionContext.globalState.get<boolean>(ConsolasConstants.CONSOLAS_TERMS_ACCEPTED_KEY) || false
        return acceptedTerms && consolasEnabled
    }
}

export function get(key: string, context: ExtContext): any {
    return context.extensionContext.globalState.get(key)
}

export function set(key: string, value: any, context: ExtContext): void {
    context.extensionContext.globalState.update(key, value).then(
        () => {},
        error => {
            getLogger().verbose(`Failed to update global state: ${error}`)
        }
    )
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
