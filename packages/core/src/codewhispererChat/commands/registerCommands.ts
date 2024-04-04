/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { focusAmazonQPanel } from '../../auth/ui/vue/show'
import { CodeScanIssue } from '../../codewhisperer/models/model'
import { Commands } from '../../shared/vscode/commands2'
import { ChatControllerMessagePublishers } from '../controllers/chat/controller'

const getCommandTriggerType = (data: any): EditorContextCommandTriggerType => {
    // data is undefined when commands triggered from keybinding or command palette. Currently no
    // way to differentiate keybinding and command palette, so both interactions are recorded as keybinding
    return data === undefined ? 'keybinding' : 'contextMenu'
}

export function registerCommands(controllerPublishers: ChatControllerMessagePublishers) {
    Commands.register('aws.amazonq.explainCode', async data => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.explainCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.refactorCode', async data => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.refactorCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.fixCode', async data => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.fixCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.optimizeCode', async data => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.optimizeCode',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.sendToPrompt', async data => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.sendToPrompt',
                triggerType: getCommandTriggerType(data),
            })
        })
    })
    Commands.register('aws.amazonq.explainIssue', async issue => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.explainIssue',
                triggerType: 'click',
                issue,
            })
        })
    })
    Commands.register('aws.amazonq.fixIssue', async issue => {
        return focusAmazonQPanel().then(() => {
            controllerPublishers.processContextMenuCommand.publish({
                type: 'aws.amazonq.fixIssue',
                triggerType: 'click',
                issue,
            })
        })
    })
}

export type EditorContextCommandType =
    | 'aws.amazonq.explainCode'
    | 'aws.amazonq.refactorCode'
    | 'aws.amazonq.fixCode'
    | 'aws.amazonq.optimizeCode'
    | 'aws.amazonq.sendToPrompt'
    | 'aws.amazonq.explainIssue'
    | 'aws.amazonq.fixIssue'

export type EditorContextCommandTriggerType = 'contextMenu' | 'keybinding' | 'commandPalette' | 'click'

export interface EditorContextCommandBase {
    type: Exclude<EditorContextCommandType, 'aws.amazonq.explainIssue' | 'aws.amazonq.fixIssue'>
    triggerType: EditorContextCommandTriggerType
}

export interface EditorContextCommandWithIssue {
    type: Extract<EditorContextCommandType, 'aws.amazonq.explainIssue' | 'aws.amazonq.fixIssue'>
    triggerType: EditorContextCommandTriggerType
    issue: CodeScanIssue
}

export type EditorContextCommand = EditorContextCommandBase | EditorContextCommandWithIssue
