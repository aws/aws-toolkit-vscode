/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { DefaultCloudFormationClient } from '../../shared/clients/cloudFormationClient'

import * as localizedText from '../../shared/localizedText'
import { getLogger, Logger } from '../../shared/logger'
import { Result } from '../../shared/telemetry/telemetry'
import { CloudFormationStackNode } from '../explorer/cloudFormationNodes'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function deleteCloudFormation(refresh: () => void, node?: CloudFormationStackNode) {
    const logger: Logger = getLogger()
    let deleteResult: Result = 'Succeeded'
    const stackName = node?.stackName ?? ''
    try {
        if (!node) {
            deleteResult = 'Failed'
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.cloudFormation.unsupported',
                    'Unable to delete a CloudFormation Stack. No stack provided.'
                )
            )

            return
        }

        const userResponse = await showConfirmationMessage({
            prompt: localize(
                'AWS.message.prompt.deleteCloudFormation',
                'Are you sure you want to delete {0}?',
                stackName
            ),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        })

        if (userResponse) {
            const client = new DefaultCloudFormationClient(node.regionCode)

            await client.deleteStack(stackName)

            void vscode.window.showInformationMessage(
                localize('AWS.message.info.cloudFormation.delete', 'Deleted CloudFormation Stack {0}', stackName)
            )

            refresh()
        }
    } catch (err) {
        deleteResult = 'Failed'
        logger.error(err as Error)

        void vscode.window.showInformationMessage(
            localize(
                'AWS.message.error.cloudFormation.delete',
                'An error occurred while deleting {0}. Please check the stack events on the {1} Console',
                stackName,
                getIdeProperties().company
            )
        )
    } finally {
        telemetry.cloudformation_delete.emit({ result: deleteResult })
    }
}
