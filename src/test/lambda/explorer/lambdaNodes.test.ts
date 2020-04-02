/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import * as sinon from 'sinon'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { CONTEXT_VALUE_LAMBDA_FUNCTION, LambdaNode } from '../../../lambda/explorer/lambdaNodes'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import { asyncGenerator } from '../../utilities/collectionUtils'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from './explorerNodeAssertions'

const FAKE_REGION_CODE = 'someregioncode'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('LambdaNode', () => {
    let sandbox: sinon.SinonSandbox
    let testNode: LambdaNode

    // Mocked Lambda Client returns Lambda Functions for anything listed in lambdaFunctionNames
    let lambdaFunctionNames: string[]

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        lambdaFunctionNames = ['function1', 'function2']

        initializeClientBuilders()

        testNode = new LambdaNode(FAKE_REGION_CODE)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('returns placeholder node if no children are present', async () => {
        lambdaFunctionNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('has LambdaFunctionNode child nodes', async () => {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, lambdaFunctionNames.length, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof LambdaFunctionNode, 'Expected child node to be LambdaFunctionNode')
        )
    })

    it('has child nodes with Lambda Function contextValue', async () => {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                CONTEXT_VALUE_LAMBDA_FUNCTION,
                'expected the node to have a CloudFormation contextValue'
            )
        )
    })

    it('sorts child nodes', async () => {
        lambdaFunctionNames = UNSORTED_TEXT

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
        const lambdaClient = {
            listFunctions: sandbox.stub().callsFake(() => {
                return asyncGenerator<Lambda.FunctionConfiguration>(
                    lambdaFunctionNames.map<Lambda.FunctionConfiguration>(name => {
                        return {
                            FunctionName: name,
                        }
                    })
                )
            }),
        }

        const clientBuilder = {
            createLambdaClient: sandbox.stub().returns(lambdaClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})
