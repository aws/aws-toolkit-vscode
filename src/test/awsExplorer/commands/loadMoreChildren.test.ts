/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AwsExplorer } from '../../../awsexplorer/awsExplorer'
import { loadMoreChildrenCommand } from '../../../awsexplorer/commands/loadMoreChildren'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { verify, instance, mock, when } from '../../utilities/mockito'

describe('loadMoreChildrenCommand', () => {
    let mockNode: AWSTreeNodeBase & LoadMoreNode
    let mockAwsExplorer: AwsExplorer

    beforeEach(() => {
        mockNode = mock()
        mockAwsExplorer = mock()
    })

    it('loads more children and refreshes the node', async () => {
        when(mockNode.isLoadingMoreChildren()).thenReturn(false)

        const window = new FakeWindow()
        await loadMoreChildrenCommand(instance(mockNode), instance(mockAwsExplorer), window)

        verify(mockNode.isLoadingMoreChildren()).once()
        verify(mockNode.loadMoreChildren()).once()
        verify(mockAwsExplorer.refresh(instance(mockNode))).once()

        assert.strictEqual(window.message.error, undefined)
    })

    it('ignores invocation when load more is already in progress', async () => {
        when(mockNode.isLoadingMoreChildren()).thenReturn(true)

        const window = new FakeWindow()
        await loadMoreChildrenCommand(instance(mockNode), instance(mockAwsExplorer), window)

        verify(mockNode.loadMoreChildren()).never()
        verify(mockAwsExplorer.refresh(instance(mockNode))).never()

        assert.strictEqual(window.message.error, undefined)
    })

    it('shows an error message and refreshes the node on failure', async () => {
        when(mockNode.isLoadingMoreChildren()).thenReturn(false)
        when(mockNode.loadMoreChildren()).thenThrow(new Error('Expected failure'))

        const window = new FakeWindow()
        await loadMoreChildrenCommand(instance(mockNode), instance(mockAwsExplorer), window)

        verify(mockNode.loadMoreChildren()).once()
        verify(mockAwsExplorer.refresh(instance(mockNode))).once()

        assert.strictEqual(window.message.error, 'Error loading more resources')
    })
})
