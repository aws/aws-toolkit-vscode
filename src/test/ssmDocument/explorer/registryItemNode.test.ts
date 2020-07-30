/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    RegistryItemNode,
    amazonRegistryName,
    userRegistryName,
    sharedRegistryName,
    viewOnlyString,
} from '../../../ssmDocument/explorer/registryItemNode'
import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'

describe('RegistryItemNode', () => {
    let sandbox: sinon.SinonSandbox

    const fakeRegion = 'testRegion'
    const expectedAutomationNodeName = 'Automation'
    const expectedCommandNodeName = 'Command'
    const expectedChildNodeNames = [expectedAutomationNodeName, expectedCommandNodeName]

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('initialized name and [View Only] correctly', async () => {
        const testAmazonNode: RegistryItemNode = new RegistryItemNode(fakeRegion, amazonRegistryName)
        const testMyNode: RegistryItemNode = new RegistryItemNode(fakeRegion, userRegistryName)
        const testSharedNode: RegistryItemNode = new RegistryItemNode(fakeRegion, sharedRegistryName)

        assert.strictEqual(testAmazonNode.label, `${amazonRegistryName}${viewOnlyString}`)
        assert.strictEqual(testMyNode.label, `${userRegistryName}`)
        assert.strictEqual(testSharedNode.label, `${sharedRegistryName}${viewOnlyString}`)
    })

    it('has correct child nodes', async () => {
        const testNode: RegistryItemNode = new RegistryItemNode(fakeRegion, amazonRegistryName)
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, expectedChildNodeNames.length)
        childNodes.forEach((child, index) => {
            assert.strictEqual(child.label, expectedChildNodeNames[index])
        })
    })

    it('handles error', async () => {
        const testNode: RegistryItemNode = new RegistryItemNode(fakeRegion, amazonRegistryName)
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update child error')
        })
        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsErrorNode(childNodes)
    })
})
