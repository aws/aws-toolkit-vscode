/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthFollowUpType } from '../../../amazonq/auth/model'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { CodeReference } from '../../../amazonq/webview/ui/connector'
import { featureDevChat, licenseText } from '../../constants'
import { ChatItemAction, SourceLink } from '@aws/mynah-ui'
import { DeletedFileInfo, NewFileInfo } from '../../types'
import { ChatItemType } from '../../../amazonq/commons/model'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = featureDevChat
    readonly type: string = ''

    /**
     * Creates an instance of UiMessage.
     * @constructor
     * @param {string} tabID - The ID of the tab.
     */
    public constructor(protected tabID: string) {}
}

export class ErrorMessage extends UiMessage {
    readonly title!: string
    readonly message!: string
    override type = 'errorMessage'

    /**
     * Creates an instance of ErrorMessage.
     * @constructor
     * @param {string} title - The title of the error message.
     * @param {string} message - The content of the error message.
     * @param {string} tabID - The ID of the tab.
     */
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

    /**
     * Creates an instance of CodeResultMessage.
     * @constructor
     * @param {NewFileInfo[]} filePaths - Array of new file information.
     * @param {DeletedFileInfo[]} deletedFiles - Array of deleted file information.
     * @param {CodeReference[]} references - Array of code references.
     * @param {string} tabID - The ID of the tab.
     * @param {string} conversationID - The ID of the conversation.
     */
    constructor(
        readonly filePaths: NewFileInfo[],
        readonly deletedFiles: DeletedFileInfo[],
        references: CodeReference[],
        tabID: string,
        conversationID: string
    ) {
        super(tabID)
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
        this.conversationID = conversationID
    }
}

export class AsyncEventProgressMessage extends UiMessage {
    readonly inProgress: boolean
    readonly message: string | undefined
    override type = 'asyncEventProgressMessage'

    /**
     * Creates an instance of AsyncEventProgressMessage.
     * @constructor
     * @param {string} tabID - The ID of the tab.
     * @param {boolean} inProgress - Indicates if the event is in progress.
     * @param {string | undefined} message - The progress message.
     */
    constructor(tabID: string, inProgress: boolean, message: string | undefined) {
        super(tabID)
        this.inProgress = inProgress
        this.message = message
    }
}
export class FileComponent extends UiMessage {
    readonly filePaths: NewFileInfo[]
    readonly deletedFiles: DeletedFileInfo[]
    override type = 'updateFileComponent'
    readonly messageId: string

    /**
     * Creates an instance of FileComponent.
     * @constructor
     * @param {string} tabID - The ID of the tab.
     * @param {NewFileInfo[]} filePaths - Array of new file information.
     * @param {DeletedFileInfo[]} deletedFiles - Array of deleted file information.
     * @param {string} messageId - The ID of the message.
     */
    constructor(tabID: string, filePaths: NewFileInfo[], deletedFiles: DeletedFileInfo[], messageId: string) {
        super(tabID)
        this.filePaths = filePaths
        this.deletedFiles = deletedFiles
        this.messageId = messageId
    }
}

export class UpdatePlaceholderMessage extends UiMessage {
    readonly newPlaceholder: string
    override type = 'updatePlaceholderMessage'

    /**
     * Creates an instance of UpdatePlaceholderMessage.
     * @constructor
     * @param {string} tabID - The ID of the tab.
     * @param {string} newPlaceholder - The new placeholder text.
     */
    constructor(tabID: string, newPlaceholder: string) {
        super(tabID)
        this.newPlaceholder = newPlaceholder
    }
}

export class ChatInputEnabledMessage extends UiMessage {
    readonly enabled: boolean
    override type = 'chatInputEnabledMessage'

    /**
     * Creates an instance of ChatInputEnabledMessage.
     * @constructor
     * @param {string} tabID - The ID of the tab.
     * @param {boolean} enabled - Indicates if the chat input is enabled.
     */
    constructor(tabID: string, enabled: boolean) {
        super(tabID)
        this.enabled = enabled
    }
}

/**
 * Represents a message to open a new tab.
 */
export class OpenNewTabMessage {
    readonly time: number = Date.now()
    readonly sender: string = featureDevChat
    readonly type = 'openNewTabMessage'

    /**
     * Creates an instance of OpenNewTabMessage.
     * @constructor
     * @param {string} tabName - The name of the tab to open.
     * @param {string} tabType - The type of the tab to open.
     */
    constructor(
        readonly tabName: string,
        readonly tabType: string
    ) {}
}

/**
 * Represents a message for authentication update.
 */
export class AuthenticationUpdateMessage {
    readonly time: number = Date.now()
    readonly sender: string = featureDevChat
    readonly featureDevEnabled: boolean
    readonly authenticatingTabIDs: string[]
    readonly type = 'authenticationUpdateMessage'

    /**
     * Creates an instance of AuthenticationUpdateMessage.
     * @constructor
     * @param {boolean} featureDevEnabled - Indicates if the feature development is enabled.
     * @param {string[]} authenticatingTabIDs - Array of tab IDs that are authenticating.
     */
    constructor(featureDevEnabled: boolean, authenticatingTabIDs: string[]) {
        this.featureDevEnabled = featureDevEnabled
        this.authenticatingTabIDs = authenticatingTabIDs
    }
}

export class AuthNeededException extends UiMessage {
    readonly message: string
    readonly authType: AuthFollowUpType
    override type = 'authNeededException'

    /**
     * Creates an instance of AuthNeededException.
     * @constructor
     * @param {string} message - The error message.
     * @param {AuthFollowUpType} authType - The type of authentication follow-up needed.
     * @param {string} tabID - The ID of the tab.
     */
    constructor(message: string, authType: AuthFollowUpType, tabID: string) {
        super(tabID)
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
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageType: ChatItemType
    readonly followUps: ChatItemAction[] | undefined
    readonly relatedSuggestions: SourceLink[] | undefined
    readonly canBeVoted: boolean
    readonly requestID!: string
    readonly snapToTop: boolean
    override type = 'chatMessage'

    /**
     * Creates an instance of ChatMessage.
     * @constructor
     * @param {ChatMessageProps} props - The properties of the chat message.
     * @param {string} tabID - The ID of the tab.
     */
    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.followUps = props.followUps
        this.relatedSuggestions = props.relatedSuggestions
        this.canBeVoted = props.canBeVoted
        this.snapToTop = props.snapToTop
    }
}

/**
 * Dispatches messages from the application to the WebView.
 */
export class AppToWebViewMessageDispatcher {
    /**
     * Creates an instance of AppToWebViewMessageDispatcher.
     * @constructor
     * @param {MessagePublisher<any>} appsToWebViewMessagePublisher - The message publisher for app to WebView communication.
     */
    constructor(private readonly appsToWebViewMessagePublisher: MessagePublisher<any>) {}

    /**
     * Sends an error message to the WebView.
     * @param {ErrorMessage} message - The error message to send.
     */
    public sendErrorMessage(message: ErrorMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends a chat message to the WebView.
     * @param {ChatMessage} message - The chat message to send.
     */
    public sendChatMessage(message: ChatMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends a code result message to the WebView.
     * @param {CodeResultMessage} message - The code result message to send.
     */
    public sendCodeResult(message: CodeResultMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends an asynchronous event progress message to the WebView.
     * @param {AsyncEventProgressMessage} message - The async event progress message to send.
     */
    public sendAsyncEventProgress(message: AsyncEventProgressMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends a placeholder update message to the WebView.
     * @param {UpdatePlaceholderMessage} message - The placeholder update message to send.
     */
    public sendPlaceholder(message: UpdatePlaceholderMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends a chat input enabled message to the WebView.
     * @param {ChatInputEnabledMessage} message - The chat input enabled message to send.
     */
    public sendChatInputEnabled(message: ChatInputEnabledMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends an authentication update message to the WebView.
     * @param {AuthenticationUpdateMessage} message - The authentication update message to send.
     */
    public sendAuthenticationUpdate(message: AuthenticationUpdateMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends an authentication needed exception message to the WebView.
     * @param {AuthNeededException} message - The authentication needed exception message to send.
     */
    public sendAuthNeededExceptionMessage(message: AuthNeededException) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Sends an open new tab message to the WebView.
     * @param {OpenNewTabMessage} message - The open new tab message to send.
     */
    public sendOpenNewTask(message: OpenNewTabMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    /**
     * Updates the file component in the WebView.
     * @param {any} message - The file component update message to send.
     */
    public updateFileComponent(message: any) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
