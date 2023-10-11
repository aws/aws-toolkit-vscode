/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

type MessageCommand =
    | 'chat-prompt'
    | 'trigger-message-processed'
    | 'new-tab-was-created'
    | 'tab-was-removed'
    | 'ui-is-ready'
    | 'follow-up-was-clicked'
    | 'open-diff'
    | 'code_was_copied_to_clipboard'
    | 'insert_code_at_cursor_position'

export type ExtensionMessage = Record<string, any> & { command: MessageCommand }
