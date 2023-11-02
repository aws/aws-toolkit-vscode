/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

type MessageCommand =
    | 'chat-prompt'
    | 'trigger-message-processed'
    | 'new-tab-was-created'
    | 'tab-was-removed'
    | 'tab-was-changed'
    | 'ui-is-ready'
    | 'ui-focus'
    | 'follow-up-was-clicked'
    | 'open-diff'
    | 'code_was_copied_to_clipboard'
    | 'insert_code_at_cursor_position'
    | 'stop-response'
    | 'trigger-tabID-received'
    | 'clear'
    | 'chat-item-voted'
    | 'chat-item-feedback'

export type ExtensionMessage = Record<string, any> & { command: MessageCommand }
