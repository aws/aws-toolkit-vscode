/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// These will be moved to library which you can grab from there
// Until then keep these as is during use.
export enum ChatItemType {
    PROMPT = 'prompt',
    SYSTEM_PROMPT = 'system-prompt',
    AI_PROMPT = 'ai-prompt',
    ANSWER = 'answer',
    ANSWER_STREAM = 'answer-stream',
    ANSWER_PART = 'answer-part',
    CODE_RESULT = 'code-result',
}
export enum NotificationType {
    INFO = 'info',
    SUCCESS = 'ok-circled',
    WARNING = 'warning',
    ERROR = 'error',
}

export function createChatContent(content: string, type = ChatItemType.ANSWER) {
    return {
        body: content,
        type,
    }
}

export type AddToChat = (data: any, action: MessageActionType) => void

// You can configure below items as you like
// Since you're handling these while sending and recieving
export const messageIdentifier = 'weaverbird'
export enum MessageActionType {
    CHAT_ANSWER = 'chat-answer',
    CHAT_STREAM = 'chat-stream',
    SPINNER_STATE = 'spinner-state',
    PROMPT = 'prompt',
    UI_LOADED = 'ui-loaded',
    CLEAR = 'chat-clear',
    STOP_STREAM = 'stop-stream',
    NOTIFY = 'show-notification',
    FOLLOW_UP_CLICKED = 'follow-up-clicked',
    OPEN_DIFF = 'open-diff',
}
