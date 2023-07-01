/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../shared/utilities/vsCodeUtils'
import { getLogger } from '../../shared/logger'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { AwsExplorer } from '../awsExplorer'
import { ToolkitError } from '../../shared/errors'
import { Commands } from '../../shared/vscode/commands2'

/**
 * Loads more children for the given node.
 */
export async function loadMoreChildren(awsExplorer: AwsExplorer, node: AWSTreeNodeBase & LoadMoreNode): Promise<void> {
    // This can happen if the user double clicks a node that executes this command before the node is hidden
    if (node.isLoadingMoreChildren()) {
        getLogger().debug('LoadMoreChildren already in progress. Ignoring.')
        return
    }

    try {
        await node.loadMoreChildren()
    } catch (e) {
        const message = localize('AWS.explorerNode.loadMoreChildren.error', 'Error loading more resources')
        throw ToolkitError.chain(e, message)
    } finally {
        awsExplorer.refresh(node)
    }
}

export const loadMoreChildrenCommand = Commands.declare('aws.loadMoreChildren', (explorer: AwsExplorer) => {
    return loadMoreChildren.bind(undefined, explorer)
})
