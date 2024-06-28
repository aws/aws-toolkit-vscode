/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared'
import { DocumentDBNode } from '../explorer/docdbNode'

/**
 * Creates a DocumentDB cluster.
 *
 * Prompts the user for the cluster name.
 * Creates the cluster.
 * Refreshes the node.
 */
export async function createCluster(node?: DocumentDBNode) {
    getLogger().debug('CreateCluster called for: %O', node)
}
