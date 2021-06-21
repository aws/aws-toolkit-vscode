/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { getLogger, showLogOutputChannel } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
const localize = nls.loadMessageBundle()

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { Env } from '../../shared/vscode/env'
import { Window } from '../../shared/vscode/window'
import { Commands } from '../../shared/vscode/commands'
import { COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS } from '../../shared/constants'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
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
        getLogger().debug('CopyArn called for %O', node)
        await env.clipboard.writeText(node.arn)
        getLogger().info(`Copied arn ${node.arn} to clipboard`)
        recordCopyArn({ result: 'Succeeded' })

        window.setStatusBarMessage(
            addCodiconToString(
                'clippy',
                localize('AWS.explorerNode.copiedToClipboard', 'Copied {0} to clipboard', 'ARN')
            ),
            COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS
        )
    } catch (e) {
        const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
        window
            .showErrorMessage(
                localize('AWS.explorerNode.noArnFound', 'Could not find an ARN for selected {0} Explorer node', getIdeProperties().company),
                logsItem
            )
            .then(selection => {
                if (selection === logsItem) {
                    showLogOutputChannel()
                }
            })
        recordCopyArn({ result: 'Failed' })
    }
}

// TODO add telemetry for copy arn
function recordCopyArn({ result }: { result: telemetry.Result }): void {}
