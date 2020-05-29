/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../shared/utilities/vsCodeUtils'
import { getLogger } from '../../shared/logger'
import { showLogOutputChannel } from '../../shared/logger'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { Window } from '../../shared/vscode/window'
import { AwsExplorer } from '../awsExplorer'

/**
 * Loads more children for the given node.
 */
export async function loadMoreChildrenCommand(
    node: AWSTreeNodeBase & LoadMoreNode,
    awsExplorer: AwsExplorer,
    window = Window.vscode()
): Promise<void> {
    try {
        getLogger().debug('LoadMoreChildren called for %O', node)
        await node.loadMoreChildren()
    } catch (e) {
        const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')
        window
            .showErrorMessage(
                localize('AWS.explorerNode.loadMoreChildren.error', 'Error loading more resources'),
                logsItem
            )
            .then(selection => {
                if (selection === logsItem) {
                    showLogOutputChannel()
                }
            })
    }
    awsExplorer.refresh(node)
}
