/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class controls the presentation of the various chat bubbles presented by the
 * Q Test.
 *
 * As much as possible, all strings used in the experience should originate here.
 */

import { AuthFollowUpType, AuthMessageDataMap } from '../../../../amazonq/auth/model'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import {
    AppToWebViewMessageDispatcher,
    AuthNeededException,
    AuthenticationUpdateMessage,
    BuildProgressMessage,
    CapabilityCardMessage,
    ChatInputEnabledMessage,
    ChatMessage,
    ChatSummaryMessage,
    ErrorMessage,
    UpdatePlaceholderMessage,
    UpdatePromptProgressMessage,
} from '../../views/connector/connector'
import { ChatItemType } from '../../../../amazonq/commons/model'
import { ChatItemAction, ProgressField } from '@aws/mynah-ui'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'
import { TriggerPayload } from '../../../../codewhispererChat/controllers/chat/model'
import {
    CodeWhispererStreamingServiceException,
    GenerateAssistantResponseCommandOutput,
} from '@amzn/codewhisperer-streaming'
import { Session } from '../../session/session'
import { CodeReference } from '../../../../amazonq/webview/ui/apps/amazonqCommonsConnector'
import { getHttpStatusCode, getRequestId, getTelemetryReasonDesc, ToolkitError } from '../../../../shared/errors'
import { sleep, waitUntil } from '../../../../shared/utilities/timeoutUtils'
import { keys } from '../../../../shared/utilities/tsUtils'
import { AuthUtil, testGenState } from '../../../../codewhisperer'
import { cancellingProgressField, testGenCompletedField } from '../../../models/constants'
import { telemetry } from '../../../../shared/telemetry/telemetry'

export type UnrecoverableErrorType = 'no-project-found' | 'no-open-file-found' | 'invalid-file-type'

export enum TestNamedMessages {
    TEST_GENERATION_BUILD_STATUS_MESSAGE = 'testGenerationBuildStatusMessage',
}

export interface FollowUps {
    text?: string
    options?: ChatItemAction[]
}

export interface FileList {
    fileTreeTitle?: string
    rootFolderTitle?: string
    filePaths?: string[]
}

export interface SendBuildProgressMessageParams {
    tabID: string
    messageType: ChatItemType
    codeGenerationId: string
    message?: string
    canBeVoted: boolean
    messageId?: string
    followUps?: FollowUps
    fileList?: FileList
    codeReference?: CodeReference[]
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    public sendCapabilityCard(params: { tabID: string }) {
        this.dispatcher.sendChatMessage(new CapabilityCardMessage(params.tabID))
    }

    public sendMessage(message: string, tabID: string, messageType: ChatItemType) {
        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType }, tabID))
    }

    public sendShortSummary(params: {
        message?: string
        type: ChatItemType
        tabID: string
        messageID?: string
        canBeVoted?: boolean
        filePath?: string
    }) {
        this.dispatcher.sendChatSummaryMessage(
            new ChatSummaryMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    messageId: params.messageID,
                    canBeVoted: params.canBeVoted,
                    filePath: params.filePath,
                },
                params.tabID
            )
        )
    }

    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, enabled))
    }

    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendUpdatePlaceholder(new UpdatePlaceholderMessage(tabID, newPlaceholder))
    }

    public sendUpdatePromptProgress(tabID: string, progressField: ProgressField | null) {
        this.dispatcher.sendUpdatePromptProgress(new UpdatePromptProgressMessage(tabID, progressField))
    }

    public async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState, tabID: string) {
        let authType: AuthFollowUpType = 'full-auth'
        let message = AuthMessageDataMap[authType].message

        switch (credentialState.amazonQ) {
            case 'disconnected':
                authType = 'full-auth'
                message = AuthMessageDataMap[authType].message
                break
            case 'unsupported':
                authType = 'use-supported-auth'
                message = AuthMessageDataMap[authType].message
                break
            case 'expired':
                authType = 're-auth'
                message = AuthMessageDataMap[authType].message
                break
        }

        this.dispatcher.sendAuthNeededExceptionMessage(new AuthNeededException(message, authType, tabID))
    }

    public sendAuthenticationUpdate(testEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(new AuthenticationUpdateMessage(testEnabled, authenticatingTabIDs))
    }

    /**
     * This method renders an error message with a button at the end that will try the
     * transformation again from the beginning. This message is meant for errors that are
     * completely unrecoverable: the job cannot be completed in its current state,
     * and the flow must be tried again.
     */
    public sendUnrecoverableErrorResponse(type: UnrecoverableErrorType, tabID: string) {
        let message = '...'
        switch (type) {
            case 'no-project-found':
                message = CodeWhispererConstants.noOpenProjectsFoundChatTestGenMessage
                break
            case 'no-open-file-found':
                message = CodeWhispererConstants.noOpenFileFoundChatMessage
                break
            case 'invalid-file-type':
                message = CodeWhispererConstants.invalidFileTypeChatMessage
                break
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'answer-stream',
                },
                tabID
            )
        )
    }

    public sendErrorMessage(errorMessage: string, tabID: string) {
        this.dispatcher.sendErrorMessage(
            new ErrorMessage(CodeWhispererConstants.genericErrorMessage, errorMessage, tabID)
        )
    }

    // To show the response of unsupported languages to the user in the Q-Test tab
    public async sendAIResponse(
        response: GenerateAssistantResponseCommandOutput,
        session: Session,
        tabID: string,
        triggerID: string,
        triggerPayload: TriggerPayload,
        fileName: string
    ) {
        let message = ''
        let messageId = response.$metadata.requestId ?? ''
        let codeReference: CodeReference[] = []

        if (response.generateAssistantResponseResponse === undefined) {
            throw new ToolkitError(
                `Empty response from Q Developer service. Request ID: ${response.$metadata.requestId}`
            )
        }

        const eventCounts = new Map<string, number>()
        waitUntil(
            async () => {
                for await (const chatEvent of response.generateAssistantResponseResponse!) {
                    for (const key of keys(chatEvent)) {
                        if ((chatEvent[key] as any) !== undefined) {
                            eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
                        }
                    }

                    if (
                        chatEvent.codeReferenceEvent?.references !== undefined &&
                        chatEvent.codeReferenceEvent.references.length > 0
                    ) {
                        codeReference = [
                            ...codeReference,
                            ...chatEvent.codeReferenceEvent.references.map((reference) => ({
                                ...reference,
                                recommendationContentSpan: {
                                    start: reference.recommendationContentSpan?.start ?? 0,
                                    end: reference.recommendationContentSpan?.end ?? 0,
                                },
                                information: `Reference code under **${reference.licenseName}** license from repository \`${reference.repository}\``,
                            })),
                        ]
                    }
                    if (testGenState.isCancelling()) {
                        return true
                    }
                    if (
                        chatEvent.assistantResponseEvent?.content !== undefined &&
                        chatEvent.assistantResponseEvent.content.length > 0
                    ) {
                        message += chatEvent.assistantResponseEvent.content
                        this.dispatcher.sendBuildProgressMessage(
                            new BuildProgressMessage({
                                tabID,
                                messageType: 'answer-part',
                                codeGenerationId: '',
                                message,
                                canBeVoted: false,
                                messageId,
                                followUps: undefined,
                                fileList: undefined,
                            })
                        )
                    }
                }
                return true
            },
            { timeout: 60000, truthy: true }
        )
            .catch((error: any) => {
                let errorMessage = 'Error reading chat stream.'
                let statusCode = undefined
                let requestID = undefined
                if (error instanceof CodeWhispererStreamingServiceException) {
                    errorMessage = error.message
                    statusCode = getHttpStatusCode(error) ?? 0
                    requestID = getRequestId(error)
                }
                let message = 'This error is reported to the team automatically. Please try sending your message again.'
                if (errorMessage !== undefined) {
                    message += `\n\nDetails: ${errorMessage}`
                }

                if (statusCode !== undefined) {
                    message += `\n\nStatus Code: ${statusCode}`
                }

                if (requestID !== undefined) {
                    messageId = requestID
                    message += `\n\nRequest ID: ${requestID}`
                }
                this.sendMessage(message.trim(), tabID, 'answer')
            })
            .finally(async () => {
                if (testGenState.isCancelling()) {
                    this.sendMessage(CodeWhispererConstants.unitTestGenerationCancelMessage, tabID, 'answer')
                    telemetry.amazonq_utgGenerateTests.emit({
                        cwsprChatProgrammingLanguage: session.fileLanguage ?? 'plaintext',
                        hasUserPromptSupplied: session.hasUserPromptSupplied,
                        perfClientLatency: performance.now() - session.testGenerationStartTime,
                        result: 'Cancelled',
                        reasonDesc: getTelemetryReasonDesc(CodeWhispererConstants.unitTestGenerationCancelMessage),
                        isSupportedLanguage: false,
                        credentialStartUrl: AuthUtil.instance.startUrl,
                        requestId: messageId,
                    })

                    this.dispatcher.sendUpdatePromptProgress(
                        new UpdatePromptProgressMessage(tabID, cancellingProgressField)
                    )
                    await sleep(500)
                } else {
                    telemetry.amazonq_utgGenerateTests.emit({
                        cwsprChatProgrammingLanguage: session.fileLanguage ?? 'plaintext',
                        hasUserPromptSupplied: session.hasUserPromptSupplied,
                        perfClientLatency: performance.now() - session.testGenerationStartTime,
                        result: 'Succeeded',
                        isSupportedLanguage: false,
                        credentialStartUrl: AuthUtil.instance.startUrl,
                        requestId: messageId,
                    })
                    this.dispatcher.sendUpdatePromptProgress(
                        new UpdatePromptProgressMessage(tabID, testGenCompletedField)
                    )
                    await sleep(500)
                }
                testGenState.setToNotStarted()
                // eslint-disable-next-line unicorn/no-null
                this.dispatcher.sendUpdatePromptProgress(new UpdatePromptProgressMessage(tabID, null))
            })
    }

    // To show the Build progress in the chat
    public sendBuildProgressMessage(params: SendBuildProgressMessageParams) {
        const {
            tabID,
            messageType,
            codeGenerationId,
            message,
            canBeVoted,
            messageId,
            followUps,
            fileList,
            codeReference,
        } = params
        this.dispatcher.sendBuildProgressMessage(
            new BuildProgressMessage({
                tabID,
                messageType,
                codeGenerationId,
                message,
                canBeVoted,
                messageId,
                followUps,
                fileList,
                codeReference,
            })
        )
    }
}
