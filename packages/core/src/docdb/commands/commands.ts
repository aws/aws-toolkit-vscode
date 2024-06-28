/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DBNode } from '../explorer/docdbNode'
import { DefaultDocumentDBClient } from '../../shared/clients/docdbClient'

export async function startCluster(node?: DBNode) {
    if (node?.id && node?.regionCode) {
        const client = new DefaultDocumentDBClient(node.regionCode)
        await client.startCluster(node.id)
        node?.parent.refresh()
    }
}

export async function stopCluster(node?: DBNode) {
    if (node?.id && node?.regionCode) {
        const client = new DefaultDocumentDBClient(node.regionCode)
        await client.stopCluster(node.id)
        node?.parent.refresh()
    }
}
