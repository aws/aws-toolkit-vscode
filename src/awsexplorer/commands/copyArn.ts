/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { showLogOutputChannel } from '../../shared/logger'
const localize = nls.loadMessageBundle()

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'
import { Commands } from '../../shared/vscode/commands'
import { getIdeProperties } from '../../shared/extensionUtilities'

/**
 * Copies the arn of the resource represented by the given node.
 */
export async function copyArnCommand(
    node: AWSResourceNode,
    window = Window.vscode(),
    env = Env.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    try {
        copyToClipboard(node.arn, 'ARN', window, env)
    } catch (e) {
        const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
        window
            .showErrorMessage(
                localize(
                    'AWS.explorerNode.noArnFound',
                    'Could not find an ARN for selected {0} Explorer node',
                    getIdeProperties().company
                ),
                logsItem
            )
            .then(selection => {
                if (selection === logsItem) {
                    showLogOutputChannel()
                }
            })
    }
}
