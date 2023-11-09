/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessagePublisher } from '../../../awsq/messages/messagePublisher'
import { weaverbirdChat } from '../../constants'
import { ChatItemType } from '../../models'
import { ChatItemFollowUp, SourceLink } from '@aws/mynah-ui-chat'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = weaverbirdChat
    readonly type: string = ''

    public constructor(protected tabID: string) {}
}

export class ErrorMessage extends UiMessage {
    readonly title!: string
    readonly message!: string
    override type = 'errorMessage'

    constructor(title: string, message: string, tabID: string) {
        super(tabID)
        this.title = title
        this.message = message
    }
}

export class FilePathMessage extends UiMessage {
    readonly filePaths!: string[]
    readonly message!: string
    readonly conversationID!: string
    override type = 'filePathMessage'

    constructor(filePaths: string[], tabID: string, conversationID: string) {
        super(tabID)
        this.filePaths = filePaths
        this.conversationID = conversationID
    }
}

export class AsyncEventProgressMessage extends UiMessage {
    readonly inProgress: boolean
    readonly message: string | undefined
    override type = 'asyncEventProgressMessage'

    constructor(tabID: string, inProgress: boolean, message: string | undefined) {
        super(tabID)
        this.inProgress = inProgress
        this.message = message
    }
}

export class UpdatePlaceholderMessage extends UiMessage {
    readonly newPlaceholder: string
    override type = 'updatePlaceholderMessage'

    constructor(tabID: string, newPlaceholder: string) {
        super(tabID)
        this.newPlaceholder = newPlaceholder
    }
}

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemFollowUp[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemFollowUp[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
    readonly requestID!: string
    override type = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.followUps = props.followUps
        this.relatedSuggestions = props.relatedSuggestions
    }
}

export class AppToWebViewMessageDispatcher {
    constructor(private readonly appsToWebViewMessagePublisher: MessagePublisher<any>) {}

    public sendErrorMessage(message: ErrorMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendChatMessage(message: ChatMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendFilePaths(message: FilePathMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAsyncEventProgress(message: AsyncEventProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendPlaceholder(message: UpdatePlaceholderMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
