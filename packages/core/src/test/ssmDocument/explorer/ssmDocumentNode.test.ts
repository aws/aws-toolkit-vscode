/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SsmDocumentNode } from '../../../ssmDocument/explorer/ssmDocumentNode'
import { DocumentTypeNode } from '../../../ssmDocument/explorer/documentTypeNode'
import { DEFAULT_TEST_REGION_CODE } from '../../shared/regions/testUtil'

describe('SsmDocumentNode', function () {
    it('always has 1 node: Automation Documents, if any child exists', async function () {
        const node = new SsmDocumentNode(DEFAULT_TEST_REGION_CODE)
        const childNodes = await node.getChildren()
        const expectedChildNodeNames: string[] = ['Automation Documents']

        assert.strictEqual(childNodes.length, expectedChildNodeNames.length, 'Unexpected child node length')

        childNodes.forEach((node, index) => {
            assert.ok(node instanceof DocumentTypeNode, 'Expected child node to be RegistryItemNode')
            assert.strictEqual(node.label, expectedChildNodeNames[index])
        })
    })
})
