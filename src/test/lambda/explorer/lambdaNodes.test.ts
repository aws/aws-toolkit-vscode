/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { CONTEXT_VALUE_LAMBDA_FUNCTION, LambdaNode } from '../../../lambda/explorer/lambdaNodes'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ext } from '../../../shared/extensionGlobals'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { MockLambdaClient } from '../../shared/clients/mockClients'

// TODO : Consolidate all asyncGenerator calls into a shared utility method
async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

describe('LambdaNode', () => {
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

    class ThrowErrorLambdaNode extends LambdaNode {
        public constructor() {
            super('someregioncode')
        }

        public async updateChildren(): Promise<void> {
            throw new Error('Hello there!')
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
        const testNode = new ThrowErrorLambdaNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
