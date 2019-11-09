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
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { assertNodeListOnlyContainsErrorNode } from './explorerNodeAssertions'

// TODO : Consolidate all asyncGenerator calls into a shared utility method
async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

const FAKE_REGION_CODE = 'someregioncode'

describe('LambdaNode', () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('Sorts Lambda Function Nodes', async () => {
        const inputFunctionNames: string[] = ['zebra', 'Antelope', 'aardvark', 'elephant']

        const lambdaClient = {
            listFunctions: sandbox.stub().callsFake(() => {
                return asyncGenerator<Lambda.FunctionConfiguration>(
                    inputFunctionNames.map<Lambda.FunctionConfiguration>(name => {
                        return {
                            FunctionName: name
                        }
                    })
                )
            })
        }

        ext.toolkitClientBuilder = ({
            createLambdaClient: sandbox.stub().returns(lambdaClient)
        } as any) as ToolkitClientBuilder

        const lambdaNode = new LambdaNode(FAKE_REGION_CODE)

        const children = await lambdaNode.getChildren()

        assert.strictEqual(
            inputFunctionNames.length,
            children.length,
            `Expected ${inputFunctionNames.length} Function children, got ${children.length}`
        )

        function assertChildNodeFunctionName(
            actualChildNode: LambdaFunctionNode | ErrorNode,
            expectedNodeText: string
        ) {
            assert.strictEqual(
                actualChildNode.contextValue,
                CONTEXT_VALUE_LAMBDA_FUNCTION,
                'Expected child node to be marked as a Lambda Function'
            )

            assert.strictEqual(
                'functionName' in actualChildNode,
                true,
                'Child node expected to contain functionName property'
            )

            const node = actualChildNode as LambdaFunctionNode
            assert.strictEqual(
                node.functionName,
                expectedNodeText,
                `Expected child node to have function name ${expectedNodeText} but got ${node.functionName}`
            )
        }

        assertChildNodeFunctionName(children[0], 'aardvark')
        assertChildNodeFunctionName(children[1], 'Antelope')
        assertChildNodeFunctionName(children[2], 'elephant')
        assertChildNodeFunctionName(children[3], 'zebra')
    })

    it('handles error', async () => {
        const testNode = new LambdaNode(FAKE_REGION_CODE)
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update Children error!')
        })

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })
})
