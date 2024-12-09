/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthFollowUpType } from '../../auth/model'
import { MessagePublisher } from '../../messages/messagePublisher'
import { CodeReference } from '../../webview/ui/connector'
import { ChatItemAction, ProgressField, SourceLink } from '@aws/mynah-ui'
import { ChatItemType } from '../model'
import { DeletedFileInfo, NewFileInfo } from '../../../amazonqFeatureDev/types'
import { licenseText } from '../../../amazonqFeatureDev/constants'

class UiMessage {
    readonly time: number = Date.now()
    readonly type: string = ''

    public constructor(
        protected tabID: string,
        protected sender: string
    ) {}
}

export class ErrorMessage extends UiMessage {
    readonly title!: string
    readonly message!: string
    override type = 'errorMessage'

    constructor(title: string, message: string, tabID: string, sender: string) {
        super(tabID, sender)
        this.title = title
        this.message = message
    }
}

export class CodeResultMessage extends UiMessage {
    readonly message!: string
    readonly codeGenerationId!: string
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
        readonly filePaths: NewFileInfo[],
        readonly deletedFiles: DeletedFileInfo[],
        references: CodeReference[],
        tabID: string,
        sender: string,
        conversationID: string,
        codeGenerationId: string
    ) {
        super(tabID, sender)
        this.references = references
            .filter((ref) => ref.licenseName && ref.repository && ref.url)
            .map((ref) => {
                return {
                    information: licenseText(ref),

                    // We're forced to provide these otherwise mynah ui errors somewhere down the line. Though they aren't used
                    recommendationContentSpan: {
                        start: 0,
                        end: 0,
                    },
                }
            })
        this.codeGenerationId = codeGenerationId
        this.conversationID = conversationID
    }
}

export class FolderConfirmationMessage extends UiMessage {
    readonly folderPath: string
    readonly message: string
    readonly followUps?: ChatItemAction[]
    override type = 'folderConfirmationMessage'
    constructor(tabID: string, sender: string, message: string, folderPath: string, followUps?: ChatItemAction[]) {
        super(tabID, sender)
        this.message = message
        this.folderPath = folderPath
        this.followUps = followUps
    }
}

export class UpdatePromptProgressMessage extends UiMessage {
    readonly progressField: ProgressField | null
    override type = 'updatePromptProgress'
    constructor(tabID: string, sender: string, progressField: ProgressField | null) {
        super(tabID, sender)
        this.progressField = progressField
    }
}

export class AsyncEventProgressMessage extends UiMessage {
    readonly inProgress: boolean
    readonly message: string | undefined
    override type = 'asyncEventProgressMessage'

    constructor(tabID: string, sender: string, inProgress: boolean, message: string | undefined) {
        super(tabID, sender)
        this.inProgress = inProgress
        this.message = message
    }
}

export class AuthenticationUpdateMessage {
    readonly time: number = Date.now()
    readonly type = 'authenticationUpdateMessage'

    constructor(
        readonly sender: string,
        readonly featureEnabled: boolean,
        readonly authenticatingTabIDs: string[]
    ) {}
}

export class FileComponent extends UiMessage {
    readonly filePaths: NewFileInfo[]
    readonly deletedFiles: DeletedFileInfo[]
    override type = 'updateFileComponent'
    readonly messageId: string
    readonly disableFileActions: boolean

    constructor(
        tabID: string,
        sender: string,
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        messageId: string,
        disableFileActions: boolean
    ) {
        super(tabID, sender)
        this.filePaths = filePaths
        this.deletedFiles = deletedFiles
        this.messageId = messageId
        this.disableFileActions = disableFileActions
    }
}

export class UpdatePlaceholderMessage extends UiMessage {
    readonly newPlaceholder: string
    override type = 'updatePlaceholderMessage'

    constructor(tabID: string, sender: string, newPlaceholder: string) {
        super(tabID, sender)
        this.newPlaceholder = newPlaceholder
    }
}

export class ChatInputEnabledMessage extends UiMessage {
    readonly enabled: boolean
    override type = 'chatInputEnabledMessage'

    constructor(tabID: string, sender: string, enabled: boolean) {
        super(tabID, sender)
        this.enabled = enabled
    }
}

export class OpenNewTabMessage {
    readonly time: number = Date.now()
    readonly type = 'openNewTabMessage'

    constructor(protected sender: string) {}
}

export class AuthNeededException extends UiMessage {
    readonly message: string
    readonly authType: AuthFollowUpType
    override type = 'authNeededException'

    constructor(message: string, authType: AuthFollowUpType, tabID: string, sender: string) {
        super(tabID, sender)
        this.message = message
        this.authType = authType
    }
}

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemAction[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
    readonly canBeVoted: boolean
    readonly snapToTop: boolean
    readonly messageId?: string
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemAction[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
    readonly canBeVoted: boolean
    readonly requestID!: string
    readonly snapToTop: boolean
    readonly messageId: string | undefined
    override type = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string, sender: string) {
        super(tabID, sender)
        this.message = props.message
        this.messageType = props.messageType
        this.followUps = props.followUps
        this.relatedSuggestions = props.relatedSuggestions
        this.canBeVoted = props.canBeVoted
        this.snapToTop = props.snapToTop
        this.messageId = props.messageId
    }
}

export interface UpdateAnswerMessageProps {
    readonly messageId: string
    readonly messageType: ChatItemType
    readonly followUps: ChatItemAction[] | undefined
}

export class UpdateAnswerMessage extends UiMessage {
    readonly messageId: string
    readonly messageType: ChatItemType
    readonly followUps: ChatItemAction[] | undefined
    override type = 'updateChatAnswer'

    constructor(props: UpdateAnswerMessageProps, tabID: string, sender: string) {
        super(tabID, sender)
        this.messageId = props.messageId
        this.messageType = props.messageType
        this.followUps = props.followUps
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

    public sendUpdatePromptProgress(message: UpdatePromptProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendFolderConfirmationMessage(message: FolderConfirmationMessage) {
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

    public sendAuthNeededExceptionMessage(message: AuthNeededException) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAuthenticationUpdate(message: AuthenticationUpdateMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendOpenNewTask(message: OpenNewTabMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public updateFileComponent(message: FileComponent) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public updateChatAnswer(message: UpdateAnswerMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
