/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserIntent } from '@amzn/codewhisperer-streaming'
import { MatchPolicy, CodeQuery } from '../../clients/chat/v0/model'
import { Selection } from 'vscode'

export interface TriggerTabIDReceived {
    tabID: string
    triggerID: string
}
export interface TabClosedMessage {
    tabID: string
}

export interface InsertCodeAtCursorPosition {
    tabID: string
    code: string
    insertionTargetType: string | undefined
}

export interface CopyCodeToClipboard {
    tabID: string
    code: string
    insertionTargetType: string | undefined
}

export interface PromptMessage {
    message: string | undefined
    command: string | undefined
    tabID: string
}

export interface PromptAnswer {
    messageLength: number
    command: string | undefined
    tabID: string
    suggestionCount: number
    followUpCount: number
}

export interface StopResponseMessage {
    tabID: string
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
