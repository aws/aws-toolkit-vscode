/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBClusterNode } from '../explorer/dbClusterNode'

export function stopCluster(node?: DBClusterNode): Promise<void> {
    return telemetry.docdb_stopCluster.run(async () => {
        if (node?.arn && node?.regionCode) {
            await node.client.stopCluster(node.arn)
            getLogger().info('docdb:Stop cluster: %O', node.name)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.stopCluster.success', 'Stopping cluster: {0}', node.name)
            )
            node?.parent.refresh()
        }
    })
}
