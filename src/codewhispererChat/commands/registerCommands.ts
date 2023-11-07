/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { ChatControllerMessagePublishers } from '../controllers/chat/controller'

const getCommandTriggerType = (data: any): EditorContextCommandTriggerType => {
    return data === undefined ? 'keybinding' : 'contextMenu'
}

export function registerCommands(controllerPublishers: ChatControllerMessagePublishers) {
    Commands.register('aws.awsq.explainCode', async data => {
        controllerPublishers.processContextMenuCommand.publish({
            type: 'aws.awsq.explainCode',
            triggerType: getCommandTriggerType(data),
        })
    })
    Commands.register('aws.awsq.refactorCode', async data => {
        controllerPublishers.processContextMenuCommand.publish({
            type: 'aws.awsq.refactorCode',
            triggerType: getCommandTriggerType(data),
        })
    })
    Commands.register('aws.awsq.fixCode', async data => {
        controllerPublishers.processContextMenuCommand.publish({
            type: 'aws.awsq.fixCode',
            triggerType: getCommandTriggerType(data),
        })
    })
    Commands.register('aws.awsq.optimizeCode', async data => {
        controllerPublishers.processContextMenuCommand.publish({
            type: 'aws.awsq.optimizeCode',
            triggerType: getCommandTriggerType(data),
        })
    })
    Commands.register('aws.awsq.sendToPrompt', async data => {
        controllerPublishers.processContextMenuCommand.publish({
            type: 'aws.awsq.sendToPrompt',
            triggerType: getCommandTriggerType(data),
        })
    })
}

export type EditorContextCommandType =
    | 'aws.awsq.explainCode'
    | 'aws.awsq.refactorCode'
    | 'aws.awsq.fixCode'
    | 'aws.awsq.optimizeCode'
    | 'aws.awsq.sendToPrompt'

export type EditorContextCommandTriggerType = 'contextMenu' | 'keybinding' | 'commandPalette'

export interface EditorContextCommand {
    type: EditorContextCommandType
    triggerType: EditorContextCommandTriggerType
}
