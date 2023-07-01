/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AwsExplorer } from '../../../awsexplorer/awsExplorer'
import { loadMoreChildren } from '../../../awsexplorer/commands/loadMoreChildren'
import { ToolkitError } from '../../../shared/errors'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { verify, instance, mock, when } from '../../utilities/mockito'

describe('loadMoreChildren', function () {
    let mockNode: AWSTreeNodeBase & LoadMoreNode
    let mockAwsExplorer: AwsExplorer

    beforeEach(function () {
        mockNode = mock()
        mockAwsExplorer = mock()
    })

    it('loads more children and refreshes the node', async function () {
        when(mockNode.isLoadingMoreChildren()).thenReturn(false)

        await loadMoreChildren(instance(mockAwsExplorer), instance(mockNode))

        verify(mockNode.isLoadingMoreChildren()).once()
        verify(mockNode.loadMoreChildren()).once()
        verify(mockAwsExplorer.refresh(instance(mockNode))).once()
    })

    it('ignores invocation when load more is already in progress', async function () {
        when(mockNode.isLoadingMoreChildren()).thenReturn(true)

        await loadMoreChildren(instance(mockAwsExplorer), instance(mockNode))

        verify(mockNode.loadMoreChildren()).never()
        verify(mockAwsExplorer.refresh(instance(mockNode))).never()
    })

    it('shows an error message and refreshes the node on failure', async function () {
        when(mockNode.isLoadingMoreChildren()).thenReturn(false)
        when(mockNode.loadMoreChildren()).thenThrow(new Error('Expected failure'))

        await assert.rejects(() => loadMoreChildren(instance(mockAwsExplorer), instance(mockNode)), ToolkitError)

        verify(mockNode.loadMoreChildren()).once()
        verify(mockAwsExplorer.refresh(instance(mockNode))).once()
    })
})
