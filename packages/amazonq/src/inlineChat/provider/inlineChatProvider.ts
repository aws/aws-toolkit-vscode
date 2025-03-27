/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    CodeWhispererStreamingServiceException,
    GenerateAssistantResponseCommandOutput,
} from '@amzn/codewhisperer-streaming'
import { AuthUtil, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import {
    ChatSessionStorage,
    ChatTriggerType,
    EditorContextExtractor,
    PromptMessage,
    TriggerEventsStorage,
    TriggerPayload,
    triggerPayloadToChatRequest,
    UserIntentRecognizer,
} from 'aws-core-vscode/codewhispererChat'
import { AwsClientResponseError, getLogger, isAwsError, ToolkitError } from 'aws-core-vscode/shared'
import { randomUUID } from 'crypto'
import { codeWhispererClient } from 'aws-core-vscode/codewhisperer'
import type { InlineChatEvent } from 'aws-core-vscode/codewhisperer'
import { InlineTask } from '../controller/inlineTask'
import { extractAuthFollowUp } from 'aws-core-vscode/amazonq'

export class InlineChatProvider {
    private readonly editorContextExtractor: EditorContextExtractor
    private readonly userIntentRecognizer: UserIntentRecognizer
    private readonly sessionStorage: ChatSessionStorage
    private readonly triggerEventsStorage: TriggerEventsStorage
    private errorEmitter = new vscode.EventEmitter<void>()
    public onErrorOccured = this.errorEmitter.event

    public constructor() {
        this.editorContextExtractor = new EditorContextExtractor()
        this.userIntentRecognizer = new UserIntentRecognizer()
        this.sessionStorage = new ChatSessionStorage()
        this.triggerEventsStorage = new TriggerEventsStorage()
    }

    public async processPromptMessage(message: PromptMessage) {
        return this.editorContextExtractor
            .extractContextForTrigger('ChatMessage')
            .then((context) => {
                const triggerID = randomUUID()
                this.triggerEventsStorage.addTriggerEvent({
                    id: triggerID,
                    tabID: message.tabID,
                    message: message.message,
                    type: 'inline_chat',
                    context,
                })
                return this.generateResponse(
                    {
                        message: message.message ?? '',
                        trigger: ChatTriggerType.InlineChatMessage,
                        query: message.message,
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock ?? '',
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getFromPromptChatMessage(message),
                        customization: getSelectedCustomization(),
                        profile: AuthUtil.instance.regionProfileManager.activeRegionProfile,
                        context: [],
                        relevantTextDocuments: [],
                        additionalContents: [],
                        documentReferences: [],
                        useRelevantDocuments: false,
                        contextLengths: {
                            additionalContextLengths: {
                                fileContextLength: 0,
                                promptContextLength: 0,
                                ruleContextLength: 0,
                            },
                            truncatedAdditionalContextLengths: {
                                fileContextLength: 0,
                                promptContextLength: 0,
                                ruleContextLength: 0,
                            },
                            workspaceContextLength: 0,
                            truncatedWorkspaceContextLength: 0,
                            userInputContextLength: 0,
                            truncatedUserInputContextLength: 0,
                            focusFileContextLength: 0,
                            truncatedFocusFileContextLength: 0,
                        },
                    },
                    triggerID
                )
            })
            .catch((e) => {
                this.processException(e, message.tabID)
            })
    }

    private async generateResponse(
        triggerPayload: TriggerPayload & { projectContextQueryLatencyMs?: number },
        triggerID: string
    ) {
        const triggerEvent = this.triggerEventsStorage.getTriggerEvent(triggerID)
        if (triggerEvent === undefined) {
            return
        }

        if (triggerEvent.tabID === 'no-available-tabs') {
            return
        }

        if (triggerEvent.tabID === undefined) {
            setTimeout(() => {
                this.generateResponse(triggerPayload, triggerID).catch((e) => {
                    getLogger().error('generateResponse failed: %s', (e as Error).message)
                })
            }, 20)
            return
        }

        const tabID = triggerEvent.tabID

        const credentialsState = await AuthUtil.instance.getChatAuthState()
        if (
            !(credentialsState.codewhispererChat === 'connected' && credentialsState.codewhispererCore === 'connected')
        ) {
            const { message } = extractAuthFollowUp(credentialsState)
            this.errorEmitter.fire()
            throw new ToolkitError(message)
        }
        triggerPayload.useRelevantDocuments = false

        const request = triggerPayloadToChatRequest(triggerPayload)
        const session = this.sessionStorage.getSession(tabID)
        getLogger().debug(
            `request from tab: ${tabID} conversationID: ${session.sessionIdentifier} request: %O`,
            request
        )

        let response: GenerateAssistantResponseCommandOutput | undefined = undefined
        session.createNewTokenSource()
        try {
            response = await session.chatSso(request)
            getLogger().info(
                `response to tab: ${tabID} conversationID: ${session.sessionIdentifier} requestID: ${response.$metadata.requestId} metadata: %O`,
                response.$metadata
            )
        } catch (e: any) {
            this.processException(e, tabID)
        }

        return response
    }

    private processException(e: any, tabID: string) {
        let errorMessage: string | undefined
        let requestID: string | undefined
        if (typeof e === 'string') {
            errorMessage = e.toUpperCase()
        } else if (e instanceof SyntaxError) {
            // Workaround to handle case when LB returns web-page with error and our client doesn't return proper exception
            errorMessage = AwsClientResponseError.tryExtractReasonFromSyntaxError(e)
        } else if (e instanceof CodeWhispererStreamingServiceException) {
            errorMessage = e.message
            requestID = e.$metadata.requestId
        } else if (e instanceof Error) {
            errorMessage = e.message
        }

        this.errorEmitter.fire()
        this.sessionStorage.deleteSession(tabID)

        throw ToolkitError.chain(e, errorMessage ?? 'Failed to get response', {
            details: {
                tabID,
                requestID,
            },
        })
    }

    public sendTelemetryEvent(inlineChatEvent: InlineChatEvent, currentTask?: InlineTask) {
        codeWhispererClient
            .sendTelemetryEvent({
                telemetryEvent: {
                    inlineChatEvent: {
                        ...inlineChatEvent,
                        ...(currentTask?.inlineChatEventBase() ?? {}),
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendTelemetryEvent to CodeWhisperer, requestId: ${
                        requestId ?? ''
                    }, message: ${error.message}`
                )
            })
    }
}
