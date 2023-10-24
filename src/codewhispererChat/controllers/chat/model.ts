/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchPolicy, CodeQuery } from '../../clients/chat/v0/model'

export interface TriggerTabIDReceived {
    tabID: string
    triggerID: string
}
export interface TabClosedMessage {
    tabID: string
}

export interface InsertCodeAtCursorPosition {
    code: string
}

export interface PromptMessage {
    message: string | undefined
    tabID: string
}

export interface StopResponseMessage {
    tabID: string
}

export enum ChatTriggerType {
    ChatMessage = 'ChatMessage',
}

export interface TriggerPayload {
    readonly query: string | undefined
    readonly code: string | undefined
    readonly trigger: ChatTriggerType
    readonly fileText: string | undefined
    readonly fileLanguage: string | undefined
    readonly message: string | undefined
    readonly matchPolicy: MatchPolicy | undefined
    readonly codeQuery: CodeQuery | undefined
}
