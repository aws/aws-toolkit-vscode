/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { TreeShim } from '../../shared/treeview/utils'

/**
 * Copies the name of the resource represented by the given node.
 */
export async function copyNameCommand(
    node: AWSResourceNode | TreeShim<AWSResourceNode>,
    env = Env.vscode()
): Promise<void> {
    node = node instanceof TreeShim ? node.node.resource : node

    await copyToClipboard(node.name, 'name', env)
}
