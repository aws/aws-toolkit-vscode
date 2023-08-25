/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RegistryItemNode } from '../../../ssmDocument/explorer/registryItemNode'
import { assertNodeListOnlyHasErrorNode } from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { DefaultSsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { stub } from '../../utilities/stubber'

describe('RegistryItemNode', function () {
    const regionCode = 'testRegion'
    const documentType = 'Automation'
    const registryNames = ['Owned by me', 'Owned by Amazon', 'Shared with me']

    it('handles error', async function () {
        const client = stub(DefaultSsmDocumentClient, { regionCode })
        client.listDocuments.throws('error')

        const testNode = new RegistryItemNode(regionCode, 'Owned by me', documentType, client)
        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasErrorNode(childNodes)
    })

    it('puts documents into right registry', async function () {
        return Promise.all(
            registryNames.map(async registry => {
                let owner: string
                if (registry === 'Owned by Amazon') {
                    owner = 'Amazon'
                } else if (registry === 'Owned by me') {
                    owner = '123456789012'
                } else {
                    owner = '987654321012'
                }

                const client = stub(DefaultSsmDocumentClient, { regionCode })
                client.listDocuments.callsFake(() => {
                    return asyncGenerator([
                        {
                            Name: `${owner}doc`,
                            Owner: `${owner}`,
                            DocumentType: `${documentType}`,
                        },
                    ])
                })

                const testNode: RegistryItemNode = new RegistryItemNode(regionCode, registry, documentType, client)
                const childNode = await testNode.getChildren()
                const expectedNodeNames = [`${owner}doc`]

                assert.strictEqual(childNode.length, expectedNodeNames.length)
                childNode.forEach((node, index) => {
                    assert.strictEqual(node.label, expectedNodeNames[index])
                })
            })
        )
    })
})
