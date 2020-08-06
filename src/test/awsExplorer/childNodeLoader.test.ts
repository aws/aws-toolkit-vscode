/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { MoreResultsNode } from '../../awsexplorer/moreResultsNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'

class FakeNode extends AWSTreeNodeBase {
    public constructor() {
        super('FakeNode')
    }
}

class FakeLoadMore implements LoadMoreNode {
    public loadMoreChildren(): Promise<void> {
        return Promise.resolve()
    }

    public isLoadingMoreChildren(): boolean {
        return false
    }

    public clearChildren(): void {}
}

describe('ChildNodeLoader', () => {
    const fakeNode = new FakeNode()
    const fakeLoadMore = new FakeLoadMore()

    function childLoader(): ChildNodeLoader {
        return continuedChildLoader()
    }

    function continuedChildLoader(continuationToken?: string): ChildNodeLoader {
        return new ChildNodeLoader(fakeLoadMore, _token =>
            Promise.resolve({
                newChildren: [fakeNode],
                newContinuationToken: continuationToken,
            })
        )
    }

    function delayedChildLoader(continuationToken: string): ChildNodeLoader {
        return new ChildNodeLoader(fakeLoadMore, _token => {
            return new Promise(resolve =>
                setTimeout(() =>
                    resolve({
                        newChildren: [fakeNode],
                        newContinuationToken: continuationToken,
                    })
                )
            )
        })
    }

    describe('first call to getChildren', () => {
        it('loads and returns initial children', async () => {
            const loader = childLoader()

            const [firstNode, ...otherNodes] = await loader.getChildren()

            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('loads and returns initial children with more results', async () => {
            const loader = continuedChildLoader('token')

            const [firstNode, moreResultsNode, ...otherNodes] = await loader.getChildren()

            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual((moreResultsNode as MoreResultsNode).parent, fakeLoadMore)
            assert.strictEqual(otherNodes.length, 0)
        })
    })

    describe('subsequent calls to getChildren', () => {
        it('returns existing children', async () => {
            const loader = childLoader()

            await loader.getChildren()
            const [firstNode, ...otherNodes] = await loader.getChildren()

            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })

    describe('loadMoreChildren', () => {
        it('loads and appends next page of children', async () => {
            const loader = continuedChildLoader('token')

            await loader.getChildren()
            await loader.loadMoreChildren()
            const [firstNode, secondNode, moreResultsNode, ...otherNodes] = await loader.getChildren()

            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual(secondNode, fakeNode)
            assert.strictEqual((moreResultsNode as MoreResultsNode).parent, fakeLoadMore)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('has no effect if all children already loaded', async () => {
            const loader = childLoader()

            await loader.getChildren()
            await loader.loadMoreChildren()
            await loader.loadMoreChildren()
            const [firstNode, ...otherNodes] = await loader.getChildren()

            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('queues up concurrent calls', async () => {
            const loader = delayedChildLoader('token')

            const firstCall = loader.getChildren()
            const secondCall = loader.loadMoreChildren()
            const thirdCall = loader.loadMoreChildren()
            const fourthCall = loader.getChildren()

            const [, , , children] = await Promise.all([firstCall, secondCall, thirdCall, fourthCall])
            const [firstNode, secondNode, thirdNode, moreResultsNode, ...otherNodes] = children

            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual(secondNode, fakeNode)
            assert.strictEqual(thirdNode, fakeNode)
            assert.strictEqual((moreResultsNode as MoreResultsNode).parent, fakeLoadMore)
            assert.strictEqual(otherNodes.length, 0)
        })
    })

    describe('clearChildren', () => {
        it('resets cache', async () => {
            const loader = childLoader()

            await loader.getChildren()
            await loader.loadMoreChildren()
            await loader.loadMoreChildren()
            loader.clearChildren()

            const [firstNode, ...otherNodes] = await loader.getChildren()
            assert.strictEqual(firstNode, fakeNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
