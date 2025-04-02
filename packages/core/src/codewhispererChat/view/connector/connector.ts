/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timestamp } from 'aws-sdk/clients/apigateway'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { EditorContextCommandType } from '../../commands/registerCommands'
import { AuthFollowUpType } from '../../../amazonq/auth/model'
import {
    ChatItem,
    ChatItemButton,
    ChatItemFormItem,
    DetailedList,
    DetailedListItem,
    MynahUIDataModel,
    QuickActionCommand,
} from '@aws/mynah-ui'
import { DocumentReference } from '../../controllers/chat/model'
import { TabType } from '../../../amazonq/webview/ui/storages/tabsStorage'

class UiMessage {
    readonly time: number = Date.now()
    readonly sender: string = 'CWChat'
    readonly type: string = ''

    public constructor(public tabID: string | undefined) {}
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

export interface CodeReference {
    licenseName?: string
    repository?: string
    url?: string
    recommendationContentSpan?: {
        start?: number
        end?: number
    }
}

export interface AuthNeededExceptionProps {
    readonly message: string
    readonly authType: AuthFollowUpType
    readonly triggerID: string
}

export class AuthNeededException extends UiMessage {
    readonly message: string
    readonly authType: AuthFollowUpType
    readonly triggerID: string
    override type = 'authNeededException'

    constructor(props: AuthNeededExceptionProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.triggerID = props.triggerID
        this.authType = props.authType
    }
}

export class OpenSettingsMessage extends UiMessage {
    override type = 'openSettingsMessage'
}

export class RestoreTabMessage extends UiMessage {
    override type = 'restoreTabMessage'
    readonly tabType: TabType
    readonly chats: ChatItem[]
    readonly historyId: string
    readonly exportTab?: boolean

    constructor(historyId: string, tabType: TabType, chats: ChatItem[], exportTab?: boolean) {
        super(undefined)
        this.chats = chats
        this.tabType = tabType
        this.historyId = historyId
        this.exportTab = exportTab
    }
}

export class OpenDetailedListMessage extends UiMessage {
    override type = 'openDetailedListMessage'
    readonly detailedList: DetailedList
    listType: string

    constructor(tabID: string, listType: string, data: DetailedList) {
        super(tabID)
        this.listType = listType
        this.detailedList = data
    }
}

export class UpdateDetailedListMessage extends UiMessage {
    override type = 'updateDetailedListMessage'
    readonly detailedList: DetailedList
    listType: string

    constructor(listType: string, data: DetailedList) {
        super(undefined)
        this.listType = listType
        this.detailedList = data
    }
}

export class CloseDetailedListMessage extends UiMessage {
    override type = 'closeDetailedListMessage'
    listType: string

    constructor(listType: string) {
        super(undefined)
        this.listType = listType
    }
}

export class ExportChatMessage extends UiMessage {
    override type = 'exportChatMessage'
    readonly format: 'markdown' | 'html'
    readonly uri: string

    constructor(tabID: string, format: 'markdown' | 'html', uri: string) {
        super(tabID)
        this.format = format
        this.uri = uri
    }
}

export class SelectTabMessage extends UiMessage {
    override type = 'selectTabMessage'
    readonly eventID?: string

    constructor(tabID: string, eventID?: string) {
        super(tabID)
        this.eventID = eventID
    }
}

export class DetailedListFilterChangeMessage extends UiMessage {
    override type = 'detailedListFilterChangeMessage'
    readonly listType: string
    readonly filterValues: Record<string, any>
    readonly isValid: boolean

    constructor(listType: string, filterValues: Record<string, any>, isValid: boolean) {
        super(undefined)
        this.listType = listType
        this.filterValues = filterValues
        this.isValid = isValid
    }
}

export class DetailedListItemSelectMessage extends UiMessage {
    override type = 'detailedListItemSelectMessage'
    readonly listType: string
    readonly item: DetailedListItem

    constructor(listType: string, item: DetailedListItem) {
        super(undefined)
        this.listType = listType
        this.item = item
    }
}

export class DetailedListActionClickMessage extends UiMessage {
    override type = 'detailedListActionClickMessage'
    readonly listType: string
    action: ChatItemButton

    constructor(listType: string, action: ChatItemButton) {
        super(undefined)
        this.listType = listType
        this.action = action
    }
}

export class ContextCommandData extends UiMessage {
    readonly data: MynahUIDataModel['contextCommands']
    override type = 'contextCommandData'
    constructor(data: MynahUIDataModel['contextCommands']) {
        super('tab-1')
        this.data = data
    }
}

export class CustomFormActionMessage extends UiMessage {
    override type = 'customFormActionMessage'
    readonly action: {
        id: string
        text?: string | undefined
        formItemValues?: Record<string, string> | undefined
    }

    constructor(
        tabID: string,
        action: {
            id: string
            text?: string | undefined
            formItemValues?: Record<string, string> | undefined
        }
    ) {
        super(tabID)
        this.action = action
    }
}

export class ShowCustomFormMessage extends UiMessage {
    override type = 'showCustomFormMessage'
    readonly formItems?: ChatItemFormItem[]
    readonly buttons?: ChatItemButton[]
    readonly title?: string
    readonly description?: string

    constructor(
        tabID: string,
        formItems?: ChatItemFormItem[],
        buttons?: ChatItemButton[],
        title?: string,
        description?: string
    ) {
        super(tabID)
        this.formItems = formItems
        this.buttons = buttons
        this.title = title
        this.description = description
    }
}

export class ContextSelectedMessage extends UiMessage {
    override type = 'contextSelectedMessage'
    readonly contextItem: QuickActionCommand

    constructor(tabID: string, contextItem: QuickActionCommand) {
        super(tabID)
        this.contextItem = contextItem
    }
}

export interface ChatMessageProps {
    readonly message: string | undefined
    readonly messageType: ChatMessageType
    readonly followUps: FollowUp[] | undefined
    readonly followUpsHeader: string | undefined
    readonly relatedSuggestions: Suggestion[] | undefined
    readonly codeReference?: CodeReference[]
    readonly triggerID: string
    readonly messageID: string
    readonly userIntent: string | undefined
    readonly codeBlockLanguage: string | undefined
    readonly contextList: DocumentReference[] | undefined
}

export class ChatMessage extends UiMessage {
    readonly message: string | undefined
    readonly messageType: ChatMessageType
    readonly followUps: FollowUp[] | undefined
    readonly codeReference: CodeReference[] | undefined
    readonly relatedSuggestions: Suggestion[] | undefined
    readonly searchResults: Suggestion[] | undefined
    readonly followUpsHeader: string | undefined
    readonly triggerID: string
    readonly messageID: string | undefined
    readonly userIntent: string | undefined
    readonly codeBlockLanguage: string | undefined
    readonly contextList: DocumentReference[] | undefined
    override type = 'chatMessage'

    constructor(props: ChatMessageProps, tabID: string) {
        super(tabID)
        this.message = props.message
        this.messageType = props.messageType
        this.followUps = props.followUps
        this.followUpsHeader = props.followUpsHeader
        this.relatedSuggestions = props.relatedSuggestions
        this.codeReference = props.codeReference
        this.triggerID = props.triggerID
        this.messageID = props.messageID
        this.userIntent = props.userIntent
        this.codeBlockLanguage = props.codeBlockLanguage
        this.contextList = props.contextList
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
    readonly command?: EditorContextCommandType
}

export class EditorContextCommandMessage extends UiMessage {
    readonly message: string
    readonly triggerID: string
    readonly command?: EditorContextCommandType
    override type = 'editorContextCommandMessage'

    constructor(props: EditorContextCommandMessageProps) {
        super(undefined)
        this.message = props.message
        this.triggerID = props.triggerID
        this.command = props.command
    }
}

export interface QuickActionMessageProps {
    readonly message: string
    readonly triggerID: string
}

export class QuickActionMessage extends UiMessage {
    readonly message: string
    readonly triggerID: string
    override type = 'editorContextCommandMessage'

    constructor(props: QuickActionMessageProps) {
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

    public sendQuickActionMessage(message: QuickActionMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendAuthNeededExceptionMessage(message: AuthNeededException) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendOpenSettingsMessage(message: OpenSettingsMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendRestoreTabMessage(message: RestoreTabMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendOpenDetailedListMessage(message: OpenDetailedListMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendUpdateDetailedListMessage(message: UpdateDetailedListMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendCloseDetailedListMessage(message: CloseDetailedListMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendSerializeTabMessage(message: ExportChatMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendSelectTabMessage(message: SelectTabMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendContextCommandData(message: ContextCommandData) {
        this.appsToWebViewMessagePublisher.publish(message)
    }

    public sendShowCustomFormMessage(message: ShowCustomFormMessage) {
        this.appsToWebViewMessagePublisher.publish(message)
    }
}
