/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { DBClusterNode } from '../explorer/dbClusterNode'

export function stopCluster(node?: DBClusterNode): Promise<void> {
    return telemetry.docdb_stopCluster.run(async () => {
        if (node?.arn && node?.regionCode) {
            const isConfirmed = await showConfirmationMessage({
                prompt: localize(
                    'AWS.docdb.stopCluster.prompt',
                    'Are you sure you want to stop cluster {0}?',
                    node.name
                ),
                confirm: localizedText.yes,
                cancel: localizedText.cancel,
            })
            if (!isConfirmed) {
                getLogger().debug('docdb: StopCluster cancelled')
                throw new CancellationError('user')
            }

            await node.client.stopCluster(node.arn)
            getLogger().info('docdb: Stop cluster: %O', node.name)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.stopCluster.success', 'Stopping cluster: {0}', node.name)
            )
        }
    })
}
