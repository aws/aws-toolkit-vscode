/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SSM } from 'aws-sdk'
import * as sinon from 'sinon'
import { DocumentTypeNode } from '../../../ssmDocument/explorer/documentTypeNode'
import { ext } from '../../../shared/extensionGlobals'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../utilities/collectionUtils'

describe('RegistryItemNode', () => {
    let sandbox: sinon.SinonSandbox

    const fakeRegion = 'testRegion'
    const documentTypes = ['Automation', 'Command']
    const registryNames = ['Owned by me', 'Owned by Amazon', 'Shared with me']

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('handles error', async () => {
        const testNode: DocumentTypeNode = new DocumentTypeNode(fakeRegion, 'Automation')
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update child error')
        })
        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    it('puts documents into right registry', async () => {
        documentTypes.forEach(async docType => {
            registryNames.forEach(async registry => {
                const testNode: DocumentTypeNode = new DocumentTypeNode(fakeRegion, docType)
                let owner: string
                if (registry === 'Owned by Amazon') {
                    owner = 'Amazon'
                } else if (registry === 'Owned by me') {
                    owner = '123456789012'
                } else {
                    owner = '987654321012'
                }

                initializeClientBuilders(owner, docType)
                const childNode = await testNode.getChildren()
                const expectedNodeNames = [`${owner}doc`]

                assert.strictEqual(childNode.length, expectedNodeNames.length)
                childNode.forEach((node, index) => {
                    assert.strictEqual(node.label, expectedNodeNames[index])
                })
            })
        })
    })

    function initializeClientBuilders(owner: string, documentType: string): void {
        const ssmDocumentClient = {
            listDocuments: sandbox.stub().callsFake(() => {
                return asyncGenerator<SSM.DocumentIdentifier>([
                    {
                        Name: `${owner}doc`,
                        Owner: `${owner}`,
                        DocumentType: `${documentType}`,
                    },
                ])
            }),
        }

        const clientBuilder = {
            createSsmClient: sandbox.stub().returns(ssmDocumentClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})
