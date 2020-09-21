/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    amazonRegistryName,
    RegistryItemNode,
    sharedRegistryName,
    userRegistryName,
    viewOnlyString,
} from '../../../ssmDocument/explorer/registryItemNode'
import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'

describe('RegistryItemNode', () => {
    let sandbox: sinon.SinonSandbox

    const fakeRegion = 'testRegion'
    const fakeDocumentType = 'Automation'
    const expectedAutomationNodeName = 'Automation Documents'
    const expectedChildNodeNames = [expectedAutomationNodeName]

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('initialized name and [View Only] correctly', async () => {
        const testAmazonNode: RegistryItemNode = new RegistryItemNode(fakeRegion, amazonRegistryName, fakeDocumentType)
        const testMyNode: RegistryItemNode = new RegistryItemNode(fakeRegion, userRegistryName, fakeDocumentType)
        const testSharedNode: RegistryItemNode = new RegistryItemNode(fakeRegion, sharedRegistryName, fakeDocumentType)

        assert.strictEqual(testAmazonNode.label, `${amazonRegistryName}${viewOnlyString}`)
        assert.strictEqual(testMyNode.label, `${userRegistryName}`)
        assert.strictEqual(testSharedNode.label, `${sharedRegistryName}${viewOnlyString}`)
    })

    it('has correct child nodes', async () => {
        const testNode: RegistryItemNode = new RegistryItemNode(fakeRegion, amazonRegistryName, fakeDocumentType)
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, expectedChildNodeNames.length)
        childNodes.forEach((child, index) => {
            assert.strictEqual(child.label, expectedChildNodeNames[index])
        })
    })

    it('handles error', async () => {
        const testNode: RegistryItemNode = new RegistryItemNode(fakeRegion, amazonRegistryName, fakeDocumentType)
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update child error')
        })
        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsErrorNode(childNodes)
    })
})
