/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemFollowUp } from '@aws/mynah-ui-chat'

export type WelcomeFollowupType = 'continue-to-chat'

export interface ConnectorProps {
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
    private readonly onWelcomeFollowUpClicked

    constructor(props: ConnectorProps) {
        this.onWelcomeFollowUpClicked = props.onWelcomeFollowUpClicked
    }

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        if (followUp.type !== undefined && followUp.type === 'continue-to-chat') {
            this.onWelcomeFollowUpClicked(tabID, followUp.type)
        }
    }
}
