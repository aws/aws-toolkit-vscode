/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AwsExplorer } from '../../../awsexplorer/awsExplorer'
import { loadMoreChildren } from '../../../awsexplorer/commands/loadMoreChildren'
import { ToolkitError } from '../../../shared/errors'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { Stub, stub } from '../../utilities/stubber'
import sinon from 'sinon'

describe('loadMoreChildren', function () {
    let mockNode: AWSTreeNodeBase & LoadMoreNode
    let mockAwsExplorer: Stub<AwsExplorer>

    beforeEach(function () {
        mockNode = {} as AWSTreeNodeBase & LoadMoreNode
        mockAwsExplorer = stub(AwsExplorer, {
            viewProviderId: '',
        })
        mockAwsExplorer.refresh = sinon.stub()
    })

    it('loads more children and refreshes the node', async function () {
        const isLoadingStub = sinon.stub().returns(false)
        mockNode.isLoadingMoreChildren = isLoadingStub
        const loadMoreStub = sinon.stub()
        mockNode.loadMoreChildren = loadMoreStub

        await loadMoreChildren(mockAwsExplorer, mockNode)

        assert(isLoadingStub.calledOnce)
        assert(loadMoreStub.calledOnce)
        assert(mockAwsExplorer.refresh.calledOnceWith(mockNode))
    })

    it('ignores invocation when load more is already in progress', async function () {
        const isLoadingStub = sinon.stub().returns(true)
        mockNode.isLoadingMoreChildren = isLoadingStub
        const loadMoreStub = sinon.stub()
        mockNode.loadMoreChildren = loadMoreStub

        await loadMoreChildren(mockAwsExplorer, mockNode)

        assert(isLoadingStub.calledOnce)
        assert(loadMoreStub.notCalled)
        assert(mockAwsExplorer.refresh.notCalled)
    })

    it('shows an error message and refreshes the node on failure', async function () {
        const isLoadingStub = sinon.stub().returns(false)
        mockNode.isLoadingMoreChildren = isLoadingStub
        const loadMoreStub = sinon.stub().throws(new Error('Expected failure'))
        mockNode.loadMoreChildren = loadMoreStub

        await assert.rejects(() => loadMoreChildren(mockAwsExplorer, mockNode), ToolkitError)

        assert(isLoadingStub.calledOnce)
        assert(mockAwsExplorer.refresh.calledOnceWith(mockNode))
    })
})
