/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthFollowUpType } from '../../../../amazonq/auth/model'
import { MessagePublisher } from '../../../../amazonq/messages/messagePublisher'
import { ChatItemAction, ChatItemButton, ProgressField, ChatItemContent } from '@aws/mynah-ui/dist/static'
import { ChatItemType } from '../../../../amazonq/commons/model'
import { testChat } from '../../../models/constants'
import { MynahIcons } from '@aws/mynah-ui'
import { SendBuildProgressMessageParams } from '../../controller/messenger/messenger'
import { CodeReference } from '../../../../codewhispererChat/view/connector/connector'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = testChat
    readonly type: TestMessageType = 'chatMessage'
    readonly status: string = 'info'

    public constructor(protected tabID: string) {}
}

export type TestMessageType =
    | 'authenticationUpdateMessage'
    | 'authNeededException'
    | 'chatMessage'
    | 'chatInputEnabledMessage'
    | 'updatePlaceholderMessage'
    | 'errorMessage'
    | 'updatePromptProgress'
    | 'chatSummaryMessage'
    | 'buildProgressMessage'

export class AuthenticationUpdateMessage {
    readonly time: number = Date.now()
    readonly sender: string = testChat
    readonly type: TestMessageType = 'authenticationUpdateMessage'

    constructor(
        readonly testEnabled: boolean,
        readonly authenticatingTabIDs: string[]
    ) {}
}

export class UpdatePromptProgressMessage extends UiMessage {
    readonly progressField: ProgressField | null
    override type: TestMessageType = 'updatePromptProgress'
    constructor(tabID: string, progressField: ProgressField | null) {
        super(tabID)
        this.progressField = progressField
    }
}

export class AuthNeededException extends UiMessage {
    override type: TestMessageType = 'authNeededException'

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
    readonly buttons?: ChatItemButton[]
    readonly followUps?: ChatItemAction[]
    readonly canBeVoted?: boolean
    readonly filePath?: string
    readonly informationCard?: ChatItemContent['informationCard']
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly messageType: ChatItemType
    readonly canBeVoted?: boolean
    readonly informationCard: ChatItemContent['informationCard']
    override type: TestMessageType = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.messageId = props.messageId || undefined
        this.canBeVoted = props.canBeVoted || undefined
        this.informationCard = props.informationCard || undefined
    }
}

export class ChatSummaryMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly messageType: ChatItemType
    readonly buttons: ChatItemButton[]
    readonly canBeVoted?: boolean
    readonly filePath?: string
    override type: TestMessageType = 'chatSummaryMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.buttons = props.buttons || []
        this.messageId = props.messageId || undefined
        this.canBeVoted = props.canBeVoted
        this.filePath = props.filePath
    }
}

export class ChatInputEnabledMessage extends UiMessage {
    override type: TestMessageType = 'chatInputEnabledMessage'

    constructor(
        tabID: string,
        readonly enabled: boolean
    ) {
        super(tabID)
    }
}

export class UpdatePlaceholderMessage extends UiMessage {
    readonly newPlaceholder: string
    override type: TestMessageType = 'updatePlaceholderMessage'

    constructor(tabID: string, newPlaceholder: string) {
        super(tabID)
        this.newPlaceholder = newPlaceholder
    }
}

export class CapabilityCardMessage extends ChatMessage {
    constructor(tabID: string) {
        super(
            {
                message: '',
                messageType: 'answer',
                informationCard: {
                    title: '/test',
                    description: 'Included in your Q Developer Agent subscription',
                    content: {
                        body: `I can generate unit tests for your active file.

After you select the functions or methods I should focus on, I will:
1. Generate unit tests
2. Place them into relevant test file

To learn more, check out our [User Guide](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-in-IDE.html).`,
                    },
                    icon: 'check-list' as MynahIcons,
                },
            },
            tabID
        )
    }
}

export class ErrorMessage extends UiMessage {
    readonly title!: string
    readonly message!: string
    override type: TestMessageType = 'errorMessage'

    constructor(title: string, message: string, tabID: string) {
        super(tabID)
        this.title = title
        this.message = message
    }
}

export class BuildProgressMessage extends UiMessage {
    readonly message: string | undefined
    readonly codeGenerationId!: string
    readonly messageId?: string
    readonly followUps?: {
        text?: string
        options?: ChatItemAction[]
    }
    readonly fileList?: {
        fileTreeTitle?: string
        rootFolderTitle?: string
        filePaths?: string[]
    }
    readonly codeReference?: CodeReference[]
    readonly canBeVoted: boolean
    readonly messageType: ChatItemType
    override type: TestMessageType = 'buildProgressMessage'

    constructor({
        tabID,
        messageType,
        codeGenerationId,
        message,
        canBeVoted,
        messageId,
        followUps,
        fileList,
        codeReference,
    }: SendBuildProgressMessageParams) {
        super(tabID)
        this.messageType = messageType
        this.codeGenerationId = codeGenerationId
        this.message = message
        this.canBeVoted = canBeVoted
        this.messageId = messageId
        this.followUps = followUps
        this.fileList = fileList
        this.codeReference = codeReference
    }
}

export class AppToWebViewMessageDispatcher {
    constructor(private readonly appsToWebViewMessagePublisher: MessagePublisher<any>) {}

    public sendChatMessage(message: ChatMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendChatSummaryMessage(message: ChatSummaryMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendUpdatePlaceholder(message: UpdatePlaceholderMessage) {
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

    public sendBuildProgressMessage(message: BuildProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendUpdatePromptProgress(message: UpdatePromptProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
