/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { UserIntent } from '@amzn/codewhisperer-streaming'
import { MatchPolicy, CodeQuery } from '../../clients/chat/v0/model'
import { Selection } from 'vscode'
import { TabOpenType } from '../../../amazonq/webview/ui/storages/tabsStorage'
import { CodeReference } from '../../view/connector/connector'

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
    code: string
    insertionTargetType: string | undefined
    codeReference: CodeReference[] | undefined
}

export interface CopyCodeToClipboard {
    command: string | undefined
    tabID: string
    messageId: string
    code: string
    insertionTargetType: string | undefined
    codeReference: CodeReference[] | undefined
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
}

export interface PromptAnswer {
    messageLength: number
    tabID: string
    suggestionCount: number
    followUpCount: number
    messageID: string
    responseCode: number
    codeReferenceCount: number
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
}

export interface TriggerPayload {
    readonly query: string | undefined
    readonly codeSelection: Selection | undefined
    readonly trigger: ChatTriggerType
    readonly fileText: string | undefined
    readonly fileLanguage: string | undefined
    readonly filePath: string | undefined
    readonly message: string | undefined
    readonly matchPolicy: MatchPolicy | undefined
    readonly codeQuery: CodeQuery | undefined
    readonly userIntent: UserIntent | undefined
}

export interface InsertedCode {
    readonly conversationID: string
    readonly messageID: string
    readonly time: Date
    readonly fileUrl: vscode.Uri
    readonly startPosition: vscode.Position
    readonly endPosition: vscode.Position
    readonly originalString: string
}
