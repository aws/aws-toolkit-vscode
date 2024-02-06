/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemFollowUp } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { AuthFollowUpType } from '../followUps/generator'

export type WelcomeFollowupType = 'continue-to-chat'

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => void
}
export interface CodeReference {
    licenseName?: string
    repository?: string
    url?: string
    recommendationContentSpan?: {
        start?: number
        end?: number
    }
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onWelcomeFollowUpClicked

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onWelcomeFollowUpClicked = props.onWelcomeFollowUpClicked
    }

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        if (followUp.type !== undefined && followUp.type === 'continue-to-chat') {
            this.onWelcomeFollowUpClicked(tabID, followUp.type)
        }
    }

    authFollowUpClicked = (tabID: string, tabType: string, authType: AuthFollowUpType): void => {
        this.sendMessageToExtension({
            command: 'auth-follow-up-was-clicked',
            authType,
            tabID,
            tabType,
        })
    }
}
