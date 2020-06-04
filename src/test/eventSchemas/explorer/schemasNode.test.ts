/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Schemas } from 'aws-sdk'
import * as sinon from 'sinon'
import { RegistryItemNode } from '../../../eventSchemas/explorer/registryItemNode'
import { SchemasNode } from '../../../eventSchemas/explorer/schemasNode'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../utilities/collectionUtils'

const FAKE_REGION_CODE = 'someregioncode'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('SchemasNode', () => {
    let sandbox: sinon.SinonSandbox
    let testNode: SchemasNode

    // Mocked Lambda Client returns Lambda Functions for anything listed in lambdaFunctionNames
    let registryNames: string[]

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        registryNames = ['registry1', 'registry2']

        initializeClientBuilders()

        testNode = new SchemasNode(FAKE_REGION_CODE)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('returns placeholder node if no children are present', async () => {
        registryNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('has RegistryItemNode child nodes', async () => {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, registryNames.length, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof RegistryItemNode, 'Expected child node to be RegistryItemNode')
        )
    })

    it('sorts child nodes', async () => {
        registryNames = UNSORTED_TEXT

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, SORTED_TEXT, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async () => {
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update Children error!')
        })

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    function initializeClientBuilders() {
        const schemaClient = {
            listRegistries: sandbox.stub().callsFake(() => {
                return asyncGenerator<Schemas.RegistrySummary>(
                    registryNames.map<Schemas.RegistrySummary>(name => {
                        return {
                            RegistryName: name,
                        }
                    })
                )
            }),
        }

        const clientBuilder = {
            createSchemaClient: sandbox.stub().returns(schemaClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})
