/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Messenger } from '../amazonq/commons/connector/baseMessenger'
import { AppToWebViewMessageDispatcher } from '../amazonq/commons/connector/connectorMessages'
import { messageWithConversationId } from '../amazonqFeatureDev/userFacingText'
import { i18n } from '../shared/i18n-helper'
import { docGenerationProgressMessage, DocGenerationStep, Mode, NewSessionFollowUps } from './constants'
import { inProgress } from './types'

export class DocMessenger extends Messenger {
    public constructor(dispatcher: AppToWebViewMessageDispatcher, sender: string) {
        super(dispatcher, sender)
    }

    /** Sends a message in the chat and displays a prompt input progress bar to communicate the doc generation progress.
     * The text in the progress bar matches the current step shown in the message.
     *
     */
    public sendDocProgress(tabID: string, step: DocGenerationStep, progress: number, mode: Mode) {
        //   Hide prompt input progress bar once all steps are completed
        if (step > DocGenerationStep.GENERATING_ARTIFACTS) {
            // eslint-disable-next-line unicorn/no-null
            this.sendUpdatePromptProgress(tabID, null)
        } else {
            const progressText =
                step === DocGenerationStep.UPLOAD_TO_S3
                    ? `${i18n('AWS.amazonq.doc.answer.scanning')}...`
                    : step === DocGenerationStep.SUMMARIZING_FILES
                      ? `${i18n('AWS.amazonq.doc.answer.summarizing')}...`
                      : `${i18n('AWS.amazonq.doc.answer.generating')}...`
            this.sendUpdatePromptProgress(tabID, inProgress(progress, progressText))
        }

        // The first step is answer-stream type, subequent updates are answer-part
        this.sendAnswer({
            type: step === DocGenerationStep.UPLOAD_TO_S3 ? 'answer-stream' : 'answer-part',
            tabID: tabID,
            disableChatInput: true,
            message: docGenerationProgressMessage(step, mode),
        })
    }

    public override sendErrorMessage(
        errorMessage: string,
        tabID: string,
        _retries: number,
        conversationId?: string,
        _showDefaultMessage?: boolean,
        enableUserInput?: boolean
    ) {
        if (enableUserInput) {
            this.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.doc.placeholder.editReadme'))
            this.sendChatInputEnabled(tabID, true)
        }
        this.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: errorMessage + messageWithConversationId(conversationId),
            followUps: enableUserInput ? [] : NewSessionFollowUps,
            disableChatInput: !enableUserInput,
        })
    }
}
