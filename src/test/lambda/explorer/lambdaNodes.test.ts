/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import * as sinon from 'sinon'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { CONTEXT_VALUE_LAMBDA_FUNCTION, LambdaNode } from '../../../lambda/explorer/lambdaNodes'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ext } from '../../../shared/extensionGlobals'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { MockLambdaClient } from '../../shared/clients/mockClients'
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

    class FunctionNamesMockLambdaClient extends MockLambdaClient {
        public constructor(
            public readonly functionNames: string[] = [],
            listFunctions: () => AsyncIterableIterator<Lambda.FunctionConfiguration> = () =>
                asyncGenerator<Lambda.FunctionConfiguration>(
                    functionNames.map<Lambda.FunctionConfiguration>(name => {
                        return {
                            FunctionName: name
                        }
                    })
                )
        ) {
            super({
                listFunctions
            })
        }
    }

    it('Sorts Lambda Function Nodes', async () => {
        const inputFunctionNames: string[] = ['zebra', 'Antelope', 'aardvark', 'elephant']

        // TODO: Move to MockToolkitClientBuilder
        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                throw new Error('cloudformation client unused')
            },

            createEcsClient(regionCode: string): EcsClient {
                throw new Error('ecs client unused')
            },

            createLambdaClient(regionCode: string): LambdaClient {
                return new FunctionNamesMockLambdaClient(inputFunctionNames)
            },

            createStsClient(regionCode: string): StsClient {
                throw new Error('sts client unused')
            }
        }

        const lambdaNode = new LambdaNode('someregioncode')

        const children = await lambdaNode.getChildren()

        assert.ok(children, 'Expected to get Lambda function nodes as children')
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
