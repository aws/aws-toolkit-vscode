/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { gumbyChat } from '../../../models/constants'
import { AuthFollowUpType } from '../../../../amazonq/auth/model'
import { MessagePublisher } from '../../../../amazonq/messages/messagePublisher'
import { ChatItemType } from '../../../../amazonqFeatureDev/models'
import { ChatItemButton, ChatItemFormItem } from '@aws/mynah-ui/dist/static'
import { GumbyCommands } from '../../controller/messenger/messengerUtils'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = gumbyChat
    readonly type: string = ''
    readonly status: string = 'info'

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

export interface AsyncEventProgressMessageProps {
    readonly inProgress: boolean
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly buttons?: ChatItemButton[]
}

export class AsyncEventProgressMessage extends UiMessage {
    readonly inProgress: boolean
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly buttons?: ChatItemButton[]
    override type = 'asyncEventProgressMessage'

    constructor(tabID: string, props: AsyncEventProgressMessageProps) {
        super(tabID)
        this.inProgress = props.inProgress
        this.message = props.message
        this.messageId = props.messageId
        this.buttons = props.buttons ?? []
    }
}

export class AuthenticationUpdateMessage {
    readonly time: number = Date.now()
    readonly sender: string = gumbyChat
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

export interface ChatPromptProps {
    readonly message: string | undefined
    formItems: ChatItemFormItem[]
}

export class ChatPrompt extends UiMessage {
    readonly message: string | undefined
    readonly messageType = 'system-prompt'
    readonly formItems: ChatItemFormItem[]
    formButtons: ChatItemButton[]
    override type = 'chatPrompt'

    constructor(props: ChatPromptProps, promptIDPrefix: string, tabID: string, keepCardAfterClick: boolean = true) {
        super(tabID)
        this.message = props.message
        this.formItems = props.formItems

        this.formButtons = []
        this.formButtons.push({
            keepCardAfterClick: keepCardAfterClick,
            waitMandatoryFormItems: true,
            text: 'Confirm',
            id: `gumby${promptIDPrefix}Confirm`,
        })
        this.formButtons.push({
            keepCardAfterClick: false,
            waitMandatoryFormItems: false,
            text: 'Cancel',
            id: `gumby${promptIDPrefix}Cancel`,
        })
    }
}

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly messageType: ChatItemType
    readonly buttons?: ChatItemButton[]
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageId?: string | undefined
    readonly messageType: ChatItemType
    readonly buttons: ChatItemButton[]
    override type = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.buttons = props.buttons || []
        this.messageId = props.messageId || undefined
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

export class SendCommandMessage extends UiMessage {
    readonly command: GumbyCommands
    readonly eventId: string
    override type = 'sendCommandMessage'

    constructor(command: GumbyCommands, tabID: string, eventId: string) {
        super(tabID)
        this.command = command
        this.eventId = eventId
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

    public sendChatPrompt(message: ChatPrompt) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAsyncEventProgress(message: AsyncEventProgressMessage) {
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

    public sendCommandMessage(message: SendCommandMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
