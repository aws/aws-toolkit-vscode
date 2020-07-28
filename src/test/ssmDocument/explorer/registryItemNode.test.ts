/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { RegistryItemNode } from '../../../ssmDocument/explorer/registryItemNode'
import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'

describe('RegistryItemNode', () => {
    let sandbox: sinon.SinonSandbox

    const fakeRegion = 'testRegion'
    const names = ['Owned by Amazon', 'Owned by me', 'Shared with me']
    const expectedChildNodeNames = ['Automation', 'Command']

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('initialized name and [View Only] correctly', async () => {
        const testAmazonNode: RegistryItemNode = new RegistryItemNode(fakeRegion, names[0])
        const testMyNode: RegistryItemNode = new RegistryItemNode(fakeRegion, names[1])
        const testSharedNode: RegistryItemNode = new RegistryItemNode(fakeRegion, names[2])

        assert.strictEqual(testAmazonNode.label, `${names[0]} [View Only]`)
        assert.strictEqual(testMyNode.label, `${names[1]}`)
        assert.strictEqual(testSharedNode.label, `${names[2]} [View Only]`)
    })

    it('has correct child nodes', async () => {
        const testNode: RegistryItemNode = new RegistryItemNode(fakeRegion, names[0])
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, expectedChildNodeNames.length)
        childNodes.forEach((child, index) => {
            assert.strictEqual(child.label, expectedChildNodeNames[index])
        })
    })

    it('handles error', async () => {
        const testNode: RegistryItemNode = new RegistryItemNode(fakeRegion, names[0])
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update child error')
        })
        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsErrorNode(childNodes)
    })
})
