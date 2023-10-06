/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchPolicy } from '../../clients/chat/v0/model'

export interface PromptMessage {
    message: string | undefined
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
    // var codeSelection: UICodeSelection? = null,
    // var codeQuery: CodeQuery? = null,
}
