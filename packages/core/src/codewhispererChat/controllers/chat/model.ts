/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    AdditionalContentEntry,
    Origin,
    RelevantTextDocument,
    ToolResult,
    UserIntent,
} from '@amzn/codewhisperer-streaming'
import { MatchPolicy, CodeQuery } from '../../clients/chat/v0/model'
import { Selection } from 'vscode'
import { TabOpenType } from '../../../amazonq/webview/ui/storages/tabsStorage'
import { CodeReference } from '../../view/connector/connector'
import { Customization } from '../../../codewhisperer/client/codewhispereruserclient'
import { QuickActionCommand } from '@aws/mynah-ui'

export interface TriggerTabIDReceived {
    tabID: string
    triggerID: string
}

export interface TabCreatedMessage {
    tabID: string
    tabOpenInteractionType: TabOpenType
}

export interface TabClosedMessage {
    tabID: string
}

export interface TabChangedMessage {
    tabID: string
    prevTabID?: string
}

export interface UIFocusMessage {
    command: string
    type: 'focus' | 'blur'
}

export interface InsertCodeAtCursorPosition {
    command: string | undefined
    tabID: string
    messageId: string
    userIntent: UserIntent | undefined
    code: string
    insertionTargetType: string | undefined
    codeReference: CodeReference[] | undefined
    eventId: string
    codeBlockIndex: number
    totalCodeBlocks: number
    codeBlockLanguage: string
}

export interface CopyCodeToClipboard {
    command: string | undefined
    tabID: string
    messageId: string
    userIntent: UserIntent | undefined
    code: string
    insertionTargetType: string | undefined
    codeReference: CodeReference[] | undefined
    eventId: string
    codeBlockIndex: number
    totalCodeBlocks: number
    codeBlockLanguage: string
}

export interface AcceptDiff {
    command: string | undefined
    tabID: string // rename tabId
    messageId: string
    actionId: string
    data: string
    code: string
    referenceTrackerInformation?: CodeReference[]
    eventId: string
    codeBlockIndex?: number
    totalCodeBlocks?: number
}
export interface ViewDiff {
    command: string | undefined
    tabID: string // rename tabId
    messageId: string
    actionId: string
    data: string
    code: string
    referenceTrackerInformation?: CodeReference[]
    eventId: string
    codeBlockIndex?: number
    totalCodeBlocks?: number
}

export type ChatPromptCommandType =
    | 'help'
    | 'clear'
    | 'follow-up-was-clicked'
    | 'onboarding-page-cwc-button-clicked'
    | 'chat-prompt'
    | 'transform'

export interface PromptMessage {
    message: string | undefined
    messageId: string
    command: ChatPromptCommandType | undefined
    userIntent: UserIntent | undefined
    tabID: string
    context?: string[] | QuickActionCommand[]
}

export interface PromptAnswer {
    messageLength: number
    tabID: string
    suggestionCount: number
    followUpCount: number
    messageID: string
    responseCode: number
    codeReferenceCount: number
    totalNumberOfCodeBlocksInResponse: number
}

export interface StopResponseMessage {
    tabID: string
}

export interface SourceLinkClickMessage {
    command: string | undefined
    tabID: string
    messageId: string
    link: string
}

export interface ResponseBodyLinkClickMessage {
    command: string | undefined
    tabID: string
    messageId: string
    link: string
}

export interface FooterInfoLinkClick {
    command: string
    tabID: string
    link: string
}

export interface QuickCommandGroupActionClick {
    command: string
    actionId: string
    tabID: string
}

export interface FileClick {
    command: string
    tabID: string
    messageId: string
    filePath: string
}

export interface ChatItemVotedMessage {
    tabID: string
    command: string
    vote: 'upvote' | 'downvote'
    messageId: string
}

export interface ChatItemFeedbackMessage {
    messageId: string
    tabID: string
    command: string
    selectedOption: string
    comment?: string
}

export enum ChatTriggerType {
    ChatMessage = 'ChatMessage',
    InlineChatMessage = 'InlineChatMessage',
}

export interface TriggerPayload {
    readonly query: string | undefined
    readonly codeSelection: Selection | undefined
    readonly trigger: ChatTriggerType
    fileText: string
    readonly fileLanguage: string | undefined
    readonly filePath: string | undefined
    message: string
    readonly matchPolicy: MatchPolicy | undefined
    readonly codeQuery: CodeQuery | undefined
    readonly userIntent: UserIntent | undefined
    readonly customization: Customization
    readonly context: string[] | QuickActionCommand[]
    relevantTextDocuments: RelevantTextDocumentAddition[]
    additionalContents: AdditionalContentEntryAddition[]
    // a reference to all documents used in chat payload
    // for providing better context transparency
    documentReferences: DocumentReference[]
    useRelevantDocuments: boolean
    traceId?: string
    contextLengths: ContextLengths
    workspaceRulesCount?: number
    toolResults?: ToolResult[]
    origin?: Origin
}

export type ContextLengths = {
    additionalContextLengths: AdditionalContextLengths
    truncatedAdditionalContextLengths: AdditionalContextLengths
    workspaceContextLength: number
    truncatedWorkspaceContextLength: number
    userInputContextLength: number
    truncatedUserInputContextLength: number
    focusFileContextLength: number
    truncatedFocusFileContextLength: number
}

export type AdditionalContextLengths = {
    fileContextLength: number
    promptContextLength: number
    ruleContextLength: number
}

export type AdditionalContextInfo = {
    cwsprChatFileContextCount?: number
    cwsprChatFolderContextCount?: number
    cwsprChatPromptContextCount?: number
    cwsprChatRuleContextCount?: number
    cwsprChatHasProjectContext?: boolean
}

export type LineInfo = { startLine: number; endLine: number }

// TODO move this to API definition (or just use this across the codebase)
export type RelevantTextDocumentAddition = RelevantTextDocument & LineInfo

export type AdditionalContentEntryAddition = AdditionalContentEntry & { type: string; relativePath: string } & LineInfo

export interface DocumentReference {
    readonly relativeFilePath: string
    readonly lineRanges: Array<{ first: number; second: number }>
}

export interface InsertedCode {
    readonly conversationID: string
    readonly messageID: string
    readonly userIntent: UserIntent | undefined
    readonly time: Date
    readonly fileUrl: vscode.Uri
    readonly startPosition: vscode.Position
    readonly endPosition: vscode.Position
    readonly originalString: string
}
