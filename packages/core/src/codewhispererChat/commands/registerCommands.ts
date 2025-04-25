/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commandPalette } from '../../codewhisperer/commands/types'
import { CodeScanIssue } from '../../codewhisperer/models/model'
import { Commands, VsCodeCommandArg, placeholder } from '../../shared/vscode/commands2'

/**
 * Opens the Amazon Q panel, showing the correct View that should
 * be shown in it.
 */
export const focusAmazonQPanel = Commands.declare(
    { id: `aws.amazonq.focusChat`, compositeKey: { 1: 'source' } },
    () => async (_: VsCodeCommandArg, source: string) => {
        /**
         * The Amazon Q panel is the window that opens when you click the Q icon
         * on the sidebar. Within this panel we can render different Views.
         *
         * The logic for determining which view is show is currently determined by
         * the value of the context `aws.amazonq.showLoginView`.
         * So when we try to focus the following Views, only one will show depending
         * on the context.
         */
        await Commands.tryExecute('aws.amazonq.AmazonQChatView.focus')
        await Commands.tryExecute('aws.amazonq.AmazonCommonAuth.focus')
    }
)

/**
 * {@link focusAmazonQPanel} but only used for the keybinding since we cannot
 * explicitly set the `source` in the package.json definition
 */
export const focusAmazonQPanelKeybinding = Commands.declare('_aws.amazonq.focusChat.keybinding', () => async () => {
    await focusAmazonQPanel.execute(placeholder, 'keybinding')
})

export function registerCommands() {
    /**
     * make these no-ops, since theres still callers that need to be deprecated
     */
    Commands.register('aws.amazonq.explainIssue', async (issue) => {})
    Commands.register('aws.amazonq.generateUnitTests', async (data) => {})
    Commands.register('aws.amazonq.updateContextCommandItems', () => {})
}

export type EditorContextBaseCommandType =
    | 'aws.amazonq.explainCode'
    | 'aws.amazonq.refactorCode'
    | 'aws.amazonq.fixCode'
    | 'aws.amazonq.optimizeCode'
    | 'aws.amazonq.sendToPrompt'
    | 'aws.amazonq.generateUnitTests'

export type CodeScanIssueCommandType = 'aws.amazonq.explainIssue'

export type EditorContextCommandType = EditorContextBaseCommandType | CodeScanIssueCommandType

export type EditorContextCommandTriggerType = 'contextMenu' | 'keybinding' | typeof commandPalette | 'click'

export interface EditorContextCommandBase {
    type: EditorContextBaseCommandType
    triggerType: EditorContextCommandTriggerType
}

export interface EditorContextCommandWithIssue {
    type: CodeScanIssueCommandType
    triggerType: EditorContextCommandTriggerType
    issue: CodeScanIssue
}

export type EditorContextCommand = EditorContextCommandBase | EditorContextCommandWithIssue
