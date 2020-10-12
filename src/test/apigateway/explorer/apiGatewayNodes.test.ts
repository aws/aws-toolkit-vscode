/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { RestApi } from 'aws-sdk/clients/apigateway'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../utilities/collectionUtils'
import { ApiGatewayNode } from '../../../apigateway/explorer/apiGatewayNodes'
import { RestApiNode } from '../../../apigateway/explorer/apiNodes'

const FAKE_PARTITION_ID = 'aws'
const FAKE_REGION_CODE = 'someregioncode'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('ApiGatewayNode', () => {
    let sandbox: sinon.SinonSandbox
    let testNode: ApiGatewayNode

    let apiNames: string[]

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        apiNames = ['api1', 'api2']

        initializeClientBuilders()

        testNode = new ApiGatewayNode(FAKE_PARTITION_ID, FAKE_REGION_CODE)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('returns placeholder node if no children are present', async () => {
        apiNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('has RestApi child nodes', async () => {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, apiNames.length, 'Unexpected child count')

        childNodes.forEach(node => assert.ok(node instanceof RestApiNode, 'Expected child node to be RestApiNode'))
    })

    it('sorts child nodes', async () => {
        apiNames = UNSORTED_TEXT

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
        const apiGatewayClient = {
            listApis: sandbox.stub().callsFake(() => {
                return asyncGenerator<RestApi>(
                    apiNames.map<RestApi>(name => {
                        return {
                            name: name,
                        }
                    })
                )
            }),
        }

        const clientBuilder = {
            createApiGatewayClient: sandbox.stub().returns(apiGatewayClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})
