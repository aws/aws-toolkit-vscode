/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ChildNodeCache } from '../../awsexplorer/childNodeCache'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'

class FakeNode extends AWSTreeNodeBase implements LoadMoreNode {
    public constructor(public name: string) {
        super('FakeNode')
    }

    public loadMoreChildren(): Promise<void> {
        return Promise.resolve()
    }

    public isLoadingMoreChildren(): boolean {
        return false
    }

    public clearChildren(): void {}
}

describe('ChildNodeCache', () => {
    const continuationToken = 'continuationToken'
    const fakeNode = new FakeNode('fakeNode')
    const anotherFakeNode = new FakeNode('anotherFakeNode')

    it('starts empty, with no continuation token, and is pristine', () => {
        const cache = new ChildNodeCache()

        assert.deepStrictEqual(cache.children, [])
        assert.strictEqual(cache.continuationToken, undefined)
        assert.strictEqual(cache.isPristine, true)
    })

    it('appends initial items and updates continuation token and pristine state', () => {
        const cache = new ChildNodeCache()
        cache.appendPage({ newChildren: [fakeNode, anotherFakeNode], newContinuationToken: continuationToken })

        assert.deepStrictEqual(cache.children, [fakeNode, anotherFakeNode])
        assert.strictEqual(cache.continuationToken, continuationToken)
        assert.strictEqual(cache.isPristine, false)
    })

    it('appends additional items', () => {
        const newFakeNode = new FakeNode('newFakeNode')

        const cache = new ChildNodeCache()
        cache.appendPage({ newChildren: [fakeNode, anotherFakeNode], newContinuationToken: continuationToken })
        cache.appendPage({ newChildren: [newFakeNode], newContinuationToken: undefined })
        assert.deepStrictEqual(cache.children, [fakeNode, anotherFakeNode, newFakeNode])
        assert.strictEqual(cache.continuationToken, undefined)
        assert.strictEqual(cache.isPristine, false)
    })
})
