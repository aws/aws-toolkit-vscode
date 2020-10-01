/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SSM } from 'aws-sdk'
import * as sinon from 'sinon'
import { SsmDocumentNode } from '../../../ssmDocument/explorer/ssmDocumentNode'
import { DocumentTypeNode } from '../../../ssmDocument/explorer/documentTypeNode'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../utilities/collectionUtils'
import { DEFAULT_TEST_ACCOUNT_ID, DEFAULT_TEST_REGION_CODE } from '../../utilities/fakeAwsContext'

describe('SsmDocumentNode', () => {
    let sandbox: sinon.SinonSandbox
    let testNode: SsmDocumentNode
    let docs: SSM.DocumentIdentifier[]

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        docs = [
            {
                Name: 'AWS-testDoc1',
                Owner: 'Amazon',
            },
            {
                Name: 'AWS-testDoc2',
                Owner: 'Amazon',
            },
            {
                Name: 'MyDoc1',
                Owner: DEFAULT_TEST_ACCOUNT_ID,
            },
            {
                Name: 'SharedDoc1',
                Owner: '987654321012',
            },
            {
                Name: 'AWS-testDoc3',
                Owner: 'Amazon',
            },
        ] as SSM.DocumentIdentifier[]

        initializeClientBuilders()
        testNode = new SsmDocumentNode(DEFAULT_TEST_REGION_CODE)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('always has 1 node: Automation Documents, if any child exists', async () => {
        const childNodes = await testNode.getChildren()
        const expectedChildNodeNames: string[] = ['Automation Documents']

        assert.strictEqual(childNodes.length, expectedChildNodeNames.length, 'Unexpected child node length')

        childNodes.forEach((node, index) => {
            assert.ok(node instanceof DocumentTypeNode, 'Expected child node to be RegistryItemNode')
            assert.strictEqual(node.label, expectedChildNodeNames[index])
        })
    })

    it('handles error', async () => {
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update children error')
        })

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    function initializeClientBuilders(): void {
        const ssmDocumentClient = {
            listDocuments: sandbox.stub().callsFake(() => {
                return asyncGenerator<SSM.DocumentIdentifier>(docs)
            }),
        }

        const clientBuilder = {
            createSsmClient: sandbox.stub().returns(ssmDocumentClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})
