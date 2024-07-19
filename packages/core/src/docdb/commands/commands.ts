/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DBNode } from '../explorer/docdbNode'
import { DefaultDocumentDBClient } from '../../shared/clients/docdbClient'

export async function startCluster(node?: DBNode) {
    if (node?.id && node?.regionCode) {
        const client = new DefaultDocumentDBClient(node.regionCode)
        await client.startCluster(node.id)
        getLogger().info('Start cluster: %O', node.id)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.startCluster.success', 'Starting cluster: {0}', node.id)
        )
        node?.parent.refresh()
    }
}

export async function stopCluster(node?: DBNode) {
    if (node?.id && node?.regionCode) {
        const client = new DefaultDocumentDBClient(node.regionCode)
        await client.stopCluster(node.id)
        getLogger().info('Stop cluster: %O', node.id)
        void vscode.window.showInformationMessage(
            localize('AWS.docdb.stopCluster.success', 'Stopping cluster: {0}', node.id)
        )
        node?.parent.refresh()
    }
}
