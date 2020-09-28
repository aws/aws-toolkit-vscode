/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { DocumentTypeNode } from '../../../ssmDocument/explorer/documentTypeNode'

import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'

describe('DocumentTypeNode', () => {
    let sandbox: sinon.SinonSandbox

    const fakeRegion = 'testRegion'
    const expectedChildNodeNames = ['Owned by Amazon', 'Owned by me', 'Shared with me']
    const documentType = 'Automation'

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('has correct child nodes', async () => {
        const testNode: DocumentTypeNode = new DocumentTypeNode(fakeRegion, documentType)
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, expectedChildNodeNames.length)
        childNodes.forEach((child, index) => {
            assert.strictEqual(child.label, expectedChildNodeNames[index])
        })
    })

    it('handles error', async () => {
        const testNode: DocumentTypeNode = new DocumentTypeNode(fakeRegion, documentType)
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update child error')
        })
        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsErrorNode(childNodes)
    })
})
