/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import {
    CodeWhispererSupplementalContext,
    ConfigurationEntry,
    GetRecommendationsResponse,
    RequestContext,
    vsCodeState,
} from '../models/model'
import { isCloud9 } from '../../shared/extensionUtilities'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import {
    CodewhispererAutomatedTriggerType,
    CodewhispererGettingStartedTask,
    CodewhispererLanguage,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry'
import { AuthUtil } from '../util/authUtil'
import { isIamConnection } from '../../auth/connection'
import { RecommendationHandler } from '../service/recommendationHandler'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { ClassifierTrigger } from './classifierTrigger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { supplementalContextTimeoutInMs } from '../models/constants'
import { fetchSupplementalContext } from '../util/supplementalContext/supplementalContextUtil'
import { getLogger } from '../../shared/logger'
import { getSelectedCustomization } from '../util/customizationUtil'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'

export class RecommendationService {
    static #instance: RecommendationService

    public static get instance() {
        return (this.#instance ??= new RecommendationService())
    }

    async generateRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        const language = runtimeLanguageContext.normalizeLanguage(editor.document.languageId)
        if (!runtimeLanguageContext.isLanguageSupported(language)) {
            // TODO: on manual trigger, show UI CW is not supporting the language
            return
        }

        if (isCloud9('any')) {
            // C9 manual trigger key alt/option + C is ALWAYS enabled because the VSC version C9 is on doesn't support setContextKey which is used for CODEWHISPERER_ENABLED
            // therefore we need a connection check if there is ANY connection(regardless of the connection's state) connected to CodeWhisperer on C9
            if (triggerType === 'OnDemand' && !AuthUtil.instance.isConnected()) {
                return
            }

            if (RecommendationHandler.instance.isGenerateRecommendationInProgress) {
                return
            }

            RecommendationHandler.instance.checkAndResetCancellationTokens()
            vsCodeState.isIntelliSenseActive = false
            RecommendationHandler.instance.isGenerateRecommendationInProgress = true

            try {
                let response: GetRecommendationsResponse

                const requestContext = await this.prepareRequestContext(
                    editor,
                    language,
                    config,
                    triggerType,
                    autoTriggerType
                )

                if (isCloud9('classic') || isIamConnection(AuthUtil.instance.conn)) {
                    response = await RecommendationHandler.instance.getRecommendations(client, requestContext, false)
                } else {
                    if (AuthUtil.instance.isConnectionExpired()) {
                        await AuthUtil.instance.showReauthenticatePrompt()
                    }
                    response = await RecommendationHandler.instance.getRecommendations(client, requestContext, true)
                }
                if (RecommendationHandler.instance.canShowRecommendationInIntelliSense(editor, true, response)) {
                    await vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                        vsCodeState.isIntelliSenseActive = true
                    })
                }
            } finally {
                RecommendationHandler.instance.isGenerateRecommendationInProgress = false
            }
        } else if (isInlineCompletionEnabled()) {
            const requestContext = await this.prepareRequestContext(
                editor,
                language,
                config,
                triggerType,
                autoTriggerType
            )
            if (triggerType === 'OnDemand') {
                ClassifierTrigger.instance.recordClassifierResultForManualTrigger(editor)
            }
            await InlineCompletionService.instance.getPaginatedRecommendation(client, requestContext, event)
        }
    }

    async prepareRequestContext(
        editor: vscode.TextEditor,
        language: CodewhispererLanguage,
        configuration: ConfigurationEntry,
        triggerType: CodewhispererTriggerType,
        autoTriggerType?: CodewhispererAutomatedTriggerType
    ): Promise<RequestContext> {
        // 1. fileContext
        const { cursorOffset, fileContext } = extractContextForCodeWhisperer(editor)

        // 2. SupplementalContext
        const tokenSource = new vscode.CancellationTokenSource()
        setTimeout(() => {
            tokenSource.cancel()
        }, supplementalContextTimeoutInMs)

        const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)
        logSupplementalContext(supplementalContexts)

        // 3. Customization
        const selectedCustomization = getSelectedCustomization()

        // 4. GetStart task
        const task = await getTaskTypeFromEditorFileName(editor.document.fileName)

        return {
            editor: editor,
            language: language,
            configuration: configuration,
            fileContext: fileContext,
            supplementalContext: supplementalContexts,
            triggerType: triggerType,
            autoTriggerType: autoTriggerType,
            cursorPosition: cursorOffset,
            customization: selectedCustomization,
            taskType: task,
        }
    }
}

function logSupplementalContext(supplementalContext: CodeWhispererSupplementalContext | undefined) {
    if (!supplementalContext) {
        return
    }

    let logString = `CodeWhispererSupplementalContext:
    isUtg: ${supplementalContext.isUtg},
    isProcessTimeout: ${supplementalContext.isProcessTimeout},
    contentsLength: ${supplementalContext.contentsLength},
    latency: ${supplementalContext.latency},
`
    supplementalContext.supplementalContextItems.forEach((context, index) => {
        logString += `Chunk ${index}:
        Path: ${context.filePath}
        Content: ${index}:${context.content}
        Score: ${context.score}
        -----------------------------------------------`
    })

    getLogger().debug(logString)
}

async function getTaskTypeFromEditorFileName(filePath: string): Promise<CodewhispererGettingStartedTask | undefined> {
    if (filePath.includes('CodeWhisperer_generate_suggestion')) {
        return 'autoTrigger'
    } else if (filePath.includes('CodeWhisperer_manual_invoke')) {
        return 'manualTrigger'
    } else if (filePath.includes('CodeWhisperer_use_comments')) {
        return 'commentAsPrompt'
    } else if (filePath.includes('CodeWhisperer_navigate_suggestions')) {
        return 'navigation'
    } else if (filePath.includes('Generate_unit_tests')) {
        return 'unitTest'
    } else {
        return undefined
    }
}
