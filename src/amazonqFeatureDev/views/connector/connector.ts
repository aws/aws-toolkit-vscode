/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthFollowUpType } from '../../../amazonq/auth/model'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { CodeReference } from '../../../amazonq/webview/ui/connector'
import { featureDevChat, licenseText } from '../../constants'
import { ChatItemType } from '../../models'
import { ChatItemFollowUp, SourceLink } from '@aws/mynah-ui'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = featureDevChat
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

export class CodeResultMessage extends UiMessage {
    readonly message!: string
    readonly references!: {
        information: string
        recommendationContentSpan: {
            start: number
            end: number
        }
    }[]
    readonly conversationID!: string
    override type = 'codeResultMessage'

    constructor(
        readonly filePaths: string[],
        readonly deletedFiles: string[],
        references: CodeReference[],
        tabID: string,
        conversationID: string
    ) {
        super(tabID)
        this.references = references
            .filter(ref => ref.licenseName && ref.repository && ref.url)
            .map(ref => {
                return {
                    information: licenseText(ref),

                    // We're forced to provide these otherwise mynah ui errors somewhere down the line. Though they aren't used
                    recommendationContentSpan: {
                        start: 0,
                        end: 0,
                    },
                }
            })
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

export class ChatInputEnabledMessage extends UiMessage {
    readonly enabled: boolean
    override type = 'chatInputEnabledMessage'

    constructor(tabID: string, enabled: boolean) {
        super(tabID)
        this.enabled = enabled
    }
}

export class OpenNewTabMessage {
    readonly time: number = Date.now()
    readonly sender: string = featureDevChat
    readonly type = 'openNewTabMessage'
}

export class AuthenticationUpdateMessage {
    readonly time: number = Date.now()
    readonly sender: string = featureDevChat
    readonly featureDevEnabled: boolean
    readonly authenticatingTabIDs: string[]
    readonly type = 'authenticationUpdateMessage'

    constructor(featureDevEnabled: boolean, authenticatingTabIDs: string[]) {
        this.featureDevEnabled = featureDevEnabled
        this.authenticatingTabIDs = authenticatingTabIDs
    }
}

export class AuthNeededException extends UiMessage {
    readonly message: string
    readonly authType: AuthFollowUpType
    override type = 'authNeededException'

    constructor(message: string, authType: AuthFollowUpType, tabID: string) {
        super(tabID)
        this.message = message
        this.authType = authType
    }
}

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemFollowUp[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
    readonly canBeVoted: boolean
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemFollowUp[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
    readonly canBeVoted: boolean
    readonly requestID!: string
    override type = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.followUps = props.followUps
        this.relatedSuggestions = props.relatedSuggestions
        this.canBeVoted = props.canBeVoted
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

    public sendCodeResult(message: CodeResultMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAsyncEventProgress(message: AsyncEventProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendPlaceholder(message: UpdatePlaceholderMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendChatInputEnabled(message: ChatInputEnabledMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAuthenticationUpdate(message: AuthenticationUpdateMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAuthNeededExceptionMessage(message: AuthNeededException) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendOpenNewTask(message: OpenNewTabMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
