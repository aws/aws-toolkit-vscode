/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    CodeWhispererStreamingServiceException,
    GenerateAssistantResponseCommandOutput,
} from '@amzn/codewhisperer-streaming'
import { AuthUtil, FeatureAuthState, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
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
import { AwsClientResponseError, getLogger, isAwsError } from 'aws-core-vscode/shared'
import { randomUUID } from 'crypto'
import { AuthFollowUpType, AuthMessageDataMap } from 'aws-core-vscode/amazonq'
import { codeWhispererClient } from 'aws-core-vscode/codewhisperer'
import type { InlineChatEvent } from 'aws-core-vscode/codewhisperer'
import { InlineTask } from '../controller/inlineTask'

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
                        message: message.message,
                        trigger: ChatTriggerType.InlineChatMessage,
                        query: message.message,
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getFromPromptChatMessage(message),
                        customization: getSelectedCustomization(),
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
            await this.sendAuthNeededExceptionMessage(credentialsState, tabID, triggerID)
            return
        }
        triggerPayload.useRelevantDocuments = false

        const request = triggerPayloadToChatRequest(triggerPayload)
        const session = this.sessionStorage.getSession(tabID)
        getLogger().info(
            `request from tab: ${tabID} conversationID: ${session.sessionIdentifier} request: ${JSON.stringify(
                request
            )}`
        )

        let response: GenerateAssistantResponseCommandOutput | undefined = undefined
        session.createNewTokenSource()
        try {
            response = await session.chat(request)
            getLogger().info(
                `response to tab: ${tabID} conversationID: ${session.sessionIdentifier} requestID: ${response.$metadata.requestId} metadata: ${JSON.stringify(
                    response.$metadata
                )}`
            )
        } catch (e: any) {
            this.processException(e, tabID)
            this.errorEmitter.fire()
            return undefined
        }

        return response
    }

    private processException(e: any, tabID: string) {
        let errorMessage = ''
        let requestID = undefined
        const defaultMessage = 'Failed to get response'
        if (typeof e === 'string') {
            errorMessage = e.toUpperCase()
        } else if (e instanceof SyntaxError) {
            // Workaround to handle case when LB returns web-page with error and our client doesn't return proper exception
            errorMessage = AwsClientResponseError.tryExtractReasonFromSyntaxError(e) ?? defaultMessage
        } else if (e instanceof CodeWhispererStreamingServiceException) {
            errorMessage = e.message
            requestID = e.$metadata.requestId
        } else if (e instanceof Error) {
            errorMessage = e.message
        }

        this.errorEmitter.fire()
        void vscode.window.showErrorMessage(errorMessage)
        getLogger().error(`error: ${errorMessage} tabID: ${tabID} requestID: ${requestID}`)
        this.sessionStorage.deleteSession(tabID)
    }

    private async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState, tabID: string, triggerID: string) {
        let authType: AuthFollowUpType = 'full-auth'
        let message = AuthMessageDataMap[authType].message
        if (
            credentialState.codewhispererChat === 'disconnected' &&
            credentialState.codewhispererCore === 'disconnected'
        ) {
            authType = 'full-auth'
            message = AuthMessageDataMap[authType].message
        }

        if (credentialState.codewhispererCore === 'connected' && credentialState.codewhispererChat === 'expired') {
            authType = 'missing_scopes'
            message = AuthMessageDataMap[authType].message
        }

        if (credentialState.codewhispererChat === 'expired' && credentialState.codewhispererCore === 'expired') {
            authType = 're-auth'
            message = AuthMessageDataMap[authType].message
        }

        this.errorEmitter.fire()
        void vscode.window.showErrorMessage(message)
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
