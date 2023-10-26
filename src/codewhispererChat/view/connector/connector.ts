/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timestamp } from 'aws-sdk/clients/apigateway'
import { MessagePublisher } from '../../../awsq/messages/messagePublisher'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = 'CWChat'
    readonly type: string = ''

    public constructor(protected tabID: string | undefined) {}
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

interface SearchSuggestionCommonProps {
    readonly title: string
    readonly url: string
    readonly body: string
    readonly id: number
}

class SearchSuggestionCommon {
    readonly title!: string
    readonly url!: string
    readonly body!: string
    readonly id!: number

    constructor(props: SearchSuggestionCommonProps) {
        this.title = props.title
        this.url = props.url
        this.body = props.body
        this.id = props.id
    }
}

export class APIDocsSuggestion extends SearchSuggestionCommon {
    readonly metadata!: APIDocsSuggestionMetadata
}

interface APIDocsSuggestionMetadata {
    readonly canonicalExample: CodeExample
}

interface CodeExample {
    readonly url: string
    readonly body: string
}

export interface SuggestionProps extends SearchSuggestionCommonProps {
    readonly metadata?: SuggestionMetadata
    readonly context: string[]
}

export class Suggestion extends SearchSuggestionCommon {
    readonly metadata?: SuggestionMetadata
    readonly context: string[]

    constructor(props: SuggestionProps) {
        super(props)
        this.metadata = props.metadata
        this.context = props.context
    }
}

interface SuggestionMetadata {
    readonly stackOverflow: StackOverflowMetadata
}

interface StackOverflowMetadata {
    readonly answerCount: number
    readonly isAccepted: boolean
    readonly score: number
    readonly lastActivityDate: Timestamp
}

export class SearchView extends UiMessage {
    readonly suggestions: Suggestion[] | undefined
    readonly apiDocsSuggestions: APIDocsSuggestion[] | undefined
    readonly enableAPIDocsTab: boolean = false
    override type = 'drawNewSearchViewState'
}

export type ChatMessageType = 'answer-stream' | 'answer-part' | 'answer'

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageType: ChatMessageType
    readonly followUps: FollowUp[] | undefined
    readonly relatedSuggestions: Suggestion[] | undefined
    readonly triggerID: string
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageType: ChatMessageType
    readonly followUps: FollowUp[] | undefined
    readonly relatedSuggestions: Suggestion[] | undefined
    readonly searchResults: Suggestion[] | undefined
    readonly triggerID: string
    override type = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.followUps = props.followUps
        this.relatedSuggestions = props.relatedSuggestions
        this.triggerID = props.triggerID
    }
}

export interface FollowUp {
    readonly type: string
    readonly pillText: string
    readonly prompt: string
}

export interface EditorContextCommandMessageProps {
    readonly message: string
    readonly triggerID: string
}

export class EditorContextCommandMessage extends UiMessage {
    readonly message: string
    readonly triggerID: string
    override type = 'editorContextCommandMessage'

    constructor(props: EditorContextCommandMessageProps) {
        super(undefined)
        this.message = props.message
        this.triggerID = props.triggerID
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

    public sendEditorContextCommandMessage(message: EditorContextCommandMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
