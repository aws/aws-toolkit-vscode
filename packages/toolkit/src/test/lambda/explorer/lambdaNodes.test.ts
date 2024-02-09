/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { contextValueLambdaFunction, LambdaNode } from '../../../lambda/explorer/lambdaNodes'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { stub } from '../../utilities/stubber'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'

const regionCode = 'someregioncode'

function createLambdaClient(...functionNames: string[]) {
    const client = stub(DefaultLambdaClient, { regionCode })
    client.listFunctions.returns(asyncGenerator(functionNames.map(name => ({ FunctionName: name }))))

    return client
}

function createNode(...functionNames: string[]) {
    return new LambdaNode(regionCode, createLambdaClient(...functionNames))
}

describe('LambdaNode', function () {
    it('returns placeholder node if no children are present', async function () {
        const childNodes = await createNode().getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has LambdaFunctionNode child nodes', async function () {
        const childNodes = await createNode('f1', 'f2').getChildren()

        assert.strictEqual(childNodes.length, 2, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof LambdaFunctionNode, 'Expected child node to be LambdaFunctionNode')
        )
    })

    it('has child nodes with Lambda Function contextValue', async function () {
        const childNodes = await createNode('f1', 'f2').getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                contextValueLambdaFunction,
                'expected the node to have a CloudFormation contextValue'
            )
        )
    })

    it('sorts child nodes', async function () {
        const childNodes = await createNode('b', 'c', 'a').getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, ['a', 'b', 'c'], 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createLambdaClient()
        client.listFunctions.throws()
        const node = new LambdaNode(regionCode, client)

        assertNodeListOnlyHasErrorNode(await node.getChildren())
    })
})
