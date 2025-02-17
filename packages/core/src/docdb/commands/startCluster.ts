/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBClusterNode } from '../explorer/dbClusterNode'

export function startCluster(node?: DBClusterNode): Promise<void> {
    return telemetry.docdb_startCluster.run(async () => {
        if (node?.arn && node?.regionCode) {
            await node.client.startCluster(node.arn)
            getLogger().info('docdb: Start cluster: %O', node.name)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.startCluster.success', 'Starting cluster: {0}', node.name)
            )
        }
    })
}
