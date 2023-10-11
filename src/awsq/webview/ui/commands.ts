/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export enum MessageCommand {
    CHAT_PROMPT = 'chat-prompt',
    TRIGGET_MESSAGE_PROCESSED = 'trigger-message-processed',
    NEW_TAB_WAS_CREATED = 'new-tab-was-created',
    TAB_WAS_REMOVED = 'tab-was-removed',
    UI_IS_READY = 'ui-is-ready',
    FOLLOW_UP_WAS_CLICKED = 'follow-up-was-clicked',
    OPEN_DIFF = 'open_diff',
}
