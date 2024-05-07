/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeScanIssue } from '../../codewhisperer/models/model'
import { Commands, VsCodeCommandArg, placeholder } from '../../shared/vscode/commands2'
import { ChatControllerMessagePublishers } from '../controllers/chat/controller'
import vscode from 'vscode'

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
        await vscode.commands.executeCommand('aws.AmazonQChatView.focus')
        await vscode.commands.executeCommand('aws.amazonq.AmazonCommonAuth.focus')
    }
)

/**
 * {@link focusAmazonQPanel} but only used for the keybinding since we cannot
 * explicitly set the `source` in the package.json definition
 */
export const focusAmazonQPanelKeybinding = Commands.declare('_aws.amazonq.focusChat.keybinding', () => async () => {
    await focusAmazonQPanel.execute(placeholder, 'keybinding')
})

const getCommandTriggerType = (data: any): EditorContextCommandTriggerType => {
    // data is undefined when commands triggered from keybinding or command palette. Currently no
    // way to differentiate keybinding and command palette, so both interactions are recorded as keybinding
    return data === undefined ? 'keybinding' : 'contextMenu'
}

export function registerCommands(controllerPublishers: ChatControllerMessagePublishers) {
    Commands.register('aws.amazonq.explainCode', async data => {
        return focusAmazonQPanel.execute(placeholder, 'amazonq.explainCode').then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.explainCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.refactorCode', async data => {
        return focusAmazonQPanel.execute(placeholder, 'amazonq.refactorCode').then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.refactorCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.fixCode', async data => {
        return focusAmazonQPanel.execute(placeholder, 'amazonq.fixCode').then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.fixCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.optimizeCode', async data => {
        return focusAmazonQPanel.execute(placeholder, 'amazonq.optimizeCode').then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.optimizeCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.sendToPrompt', async data => {
        return focusAmazonQPanel.execute(placeholder, 'amazonq.sendToPrompt').then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.sendToPrompt',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.explainIssue', async issue => {
        return focusAmazonQPanel.execute(placeholder, 'amazonq.explainIssue').then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.explainIssue',
                triggerType: 'click',
                issue,
            })
        })
    })
}

export type EditorContextBaseCommandType =
    | 'aws.amazonq.explainCode'
    | 'aws.amazonq.refactorCode'
    | 'aws.amazonq.fixCode'
    | 'aws.amazonq.optimizeCode'
    | 'aws.amazonq.sendToPrompt'

export type CodeScanIssueCommandType = 'aws.amazonq.explainIssue'

export type EditorContextCommandType = EditorContextBaseCommandType | CodeScanIssueCommandType

export type EditorContextCommandTriggerType = 'contextMenu' | 'keybinding' | 'commandPalette' | 'click'

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
