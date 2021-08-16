/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { ext } from '../../shared/extensionGlobals'
import * as localizedText from '../../shared/localizedText'
import { getLogger, Logger } from '../../shared/logger'
import { recordCloudformationDelete, Result } from '../../shared/telemetry/telemetry'
import { CloudFormationStackNode } from '../explorer/cloudFormationNodes'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { Window } from '../../shared/vscode/window'
import { getIdeProperties } from '../../shared/extensionUtilities'

export async function deleteCloudFormation(refresh: () => void, node?: CloudFormationStackNode) {
    const logger: Logger = getLogger()
    let deleteResult: Result = 'Succeeded'
    const stackName = node?.stackName ?? ''
    try {
        if (!node) {
            deleteResult = 'Failed'
            vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.cloudFormation.unsupported',
                    'Unable to delete a CloudFormation Stack. No stack provided.'
                )
            )

            return
        }

        const userResponse = await showConfirmationMessage(
            {
                prompt: localize(
                    'AWS.message.prompt.deleteCloudFormation',
                    'Are you sure you want to delete {0}?',
                    stackName
                ),
                confirm: localizedText.localizedDelete,
                cancel: localizedText.cancel,
            },
            Window.vscode()
        )

        if (userResponse) {
            const client: CloudFormationClient = ext.toolkitClientBuilder.createCloudFormationClient(node.regionCode)

            await client.deleteStack(stackName)

            vscode.window.showInformationMessage(
                localize('AWS.message.info.cloudFormation.delete', 'Deleted CloudFormation Stack {0}', stackName)
            )

            refresh()
        }
    } catch (err) {
        deleteResult = 'Failed'
        logger.error(err as Error)

        vscode.window.showInformationMessage(
            localize(
                'AWS.message.error.cloudFormation.delete',
                'An error occurred while deleting {0}. Please check the stack events on the {1} Console',
                stackName,
                getIdeProperties().company
            )
        )
    } finally {
        recordCloudformationDelete({ result: deleteResult })
    }
}
