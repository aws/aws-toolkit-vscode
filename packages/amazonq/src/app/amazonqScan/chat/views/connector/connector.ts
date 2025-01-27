/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthFollowUpType, MessagePublisher, ChatItemType } from 'aws-core-vscode/amazonq'
import { ScanMessageType } from 'aws-core-vscode/amazonqScan'
import { ChatItemButton, ProgressField, ChatItemAction, ChatItemContent } from '@aws/mynah-ui/dist/static'
import { scanChat } from '../../../models/constants'
import { MynahIcons } from '@aws/mynah-ui'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = scanChat
    readonly type: ScanMessageType = 'chatMessage'
    readonly status: string = 'info'

    public constructor(protected tabID: string) {}
}

export class AuthenticationUpdateMessage {
    readonly time: number = Date.now()
    readonly sender: string = scanChat
    readonly type: ScanMessageType = 'authenticationUpdateMessage'

    constructor(
        readonly scanEnabled: boolean,
        readonly authenticatingTabIDs: string[]
    ) {}
}

export class AuthNeededException extends UiMessage {
    override type: ScanMessageType = 'authNeededException'

    constructor(
        readonly message: string,
        readonly authType: AuthFollowUpType,
        tabID: string
    ) {
        super(tabID)
    }
}

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly messageType: ChatItemType
    readonly canBeVoted?: boolean
    readonly buttons?: ChatItemButton[]
    readonly followUps?: ChatItemAction[] | undefined
    readonly informationCard?: ChatItemContent['informationCard']
    readonly fileList?: ChatItemContent['fileList']
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly messageType: ChatItemType
    readonly canBeVoted?: boolean
    readonly buttons: ChatItemButton[]
    readonly followUps: ChatItemAction[] | undefined
    readonly informationCard: ChatItemContent['informationCard']
    readonly fileList: ChatItemContent['fileList']
    override type: ScanMessageType = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.buttons = props.buttons || []
        this.messageId = props.messageId || undefined
        this.followUps = props.followUps
        this.informationCard = props.informationCard || undefined
        this.fileList = props.fileList
        this.canBeVoted = props.canBeVoted || undefined
    }
}

export class CapabilityCardMessage extends ChatMessage {
    constructor(tabID: string) {
        super(
            {
                message: '',
                messageType: 'answer',
                informationCard: {
                    title: '/review',
                    description: 'Included in your Q Developer subscription',
                    content: {
                        body: `I can review your workspace for vulnerabilities and issues.

After you begin a review, I will: 
1. Review all relevant code in your workspace or your current file
2. Provide a list of issues for your review

You can then investigate, fix, or ignore issues.

To learn more, check out our [User Guide](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security-scans.html).`,
                    },
                    icon: 'bug' as MynahIcons,
                },
            },
            tabID
        )
    }
}

export class ChatInputEnabledMessage extends UiMessage {
    override type: ScanMessageType = 'chatInputEnabledMessage'

    constructor(
        tabID: string,
        readonly enabled: boolean
    ) {
        super(tabID)
    }
}

export class UpdatePlaceholderMessage extends UiMessage {
    readonly newPlaceholder: string
    override type: ScanMessageType = 'updatePlaceholderMessage'

    constructor(tabID: string, newPlaceholder: string) {
        super(tabID)
        this.newPlaceholder = newPlaceholder
    }
}

export class UpdatePromptProgressMessage extends UiMessage {
    readonly progressField: ProgressField | null
    override type: ScanMessageType = 'updatePromptProgress'
    constructor(tabID: string, progressField: ProgressField | null) {
        super(tabID)
        this.progressField = progressField
    }
}

export class ErrorMessage extends UiMessage {
    override type: ScanMessageType = 'errorMessage'
    constructor(
        readonly title: string,
        readonly message: string,
        tabID: string
    ) {
        super(tabID)
    }
}

export class ChatPrompt extends UiMessage {
    readonly message: string | undefined
    readonly messageType = 'system-prompt'
    override type: ScanMessageType = 'chatPrompt'
    constructor(message: string | undefined, tabID: string) {
        super(tabID)
        this.message = message
    }
}

export class AppToWebViewMessageDispatcher {
    constructor(private readonly appsToWebViewMessagePublisher: MessagePublisher<any>) {}

    public sendChatMessage(message: ChatMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendUpdatePlaceholder(message: UpdatePlaceholderMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendUpdatePromptProgress(message: UpdatePromptProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAuthenticationUpdate(message: AuthenticationUpdateMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAuthNeededExceptionMessage(message: AuthNeededException) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendChatInputEnabled(message: ChatInputEnabledMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendErrorMessage(message: ErrorMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendPromptMessage(message: ChatPrompt) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
