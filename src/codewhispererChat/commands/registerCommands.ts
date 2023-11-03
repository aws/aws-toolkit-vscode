/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { ChatControllerMessagePublishers } from '../controllers/chat/controller'

export function registerCommands(controllerPublishers: ChatControllerMessagePublishers) {
    Commands.register('aws.awsq.explainCode', async () => {
        controllerPublishers.processContextMenuCommand.publish('aws.awsq.explainCode')
    })
    Commands.register('aws.awsq.refactorCode', async () => {
        controllerPublishers.processContextMenuCommand.publish('aws.awsq.refactorCode')
    })
    Commands.register('aws.awsq.fixCode', async () => {
        controllerPublishers.processContextMenuCommand.publish('aws.awsq.fixCode')
    })
    Commands.register('aws.awsq.optimizeCode', async () => {
        controllerPublishers.processContextMenuCommand.publish('aws.awsq.optimizeCode')
    })
    Commands.register('aws.awsq.sendToPrompt', async () => {
        controllerPublishers.processContextMenuCommand.publish('aws.awsq.sendToPrompt')
    })
}

export type EditorContextCommand =
    | 'aws.awsq.explainCode'
    | 'aws.awsq.refactorCode'
    | 'aws.awsq.fixCode'
    | 'aws.awsq.optimizeCode'
    | 'aws.awsq.sendToPrompt'
