/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import * as os from 'os'
import { DefaultRegionNode } from '../../../awsexplorer/defaultRegionNode'
import {
    DefaultLambdaFunctionGroupNode,
    DefaultLambdaFunctionNode,
    LambdaFunctionNode
} from '../../../lambda/explorer/lambdaNodes'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ext } from '../../../shared/extensionGlobals'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { MockLambdaClient } from '../../shared/clients/mockClients'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'

// TODO : Consolidate all asyncGenerator calls into a shared utility method
async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

describe('DefaultLambdaFunctionNode', () => {
    let fakeFunctionConfig: Lambda.FunctionConfiguration

    before(async () => {
        setupTestIconPaths()
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN'
        }
    })

    after(async () => {
        clearTestIconPaths()
    })

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {
        const testNode = generateTestNode()

        assert.strictEqual(testNode.label, fakeFunctionConfig.FunctionName)
        assert.strictEqual(
            testNode.tooltip,
            `${fakeFunctionConfig.FunctionName}${os.EOL}${fakeFunctionConfig.FunctionArn}`
        )
    })

    it('initializes icon', async () => {
        const testNode = generateTestNode()

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.lambda, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.lambda, 'Unexpected light icon path')
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    it('returns expected context value', async () => {
        const testNode = generateTestNode()

        assert.strictEqual(testNode.contextValue, 'awsRegionFunctionNode')
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

    function generateTestNode(): DefaultLambdaFunctionNode {
        return new DefaultLambdaFunctionNode(
            new DefaultLambdaFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )
    }
})

describe('DefaultLambdaFunctionGroupNode', () => {
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

    class ThrowErrorDefaultLambdaFunctionGroupNode extends DefaultLambdaFunctionGroupNode {
        public constructor(public readonly parent: DefaultRegionNode) {
            super(parent)
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

        const functionGroupNode = new DefaultLambdaFunctionGroupNode(
            new DefaultRegionNode(new RegionInfo('code', 'name'))
        )

        const children = await functionGroupNode.getChildren()

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
                'functionName' in actualChildNode,
                true,
                'Child node expected to contain functionName property'
            )

            const node: DefaultLambdaFunctionNode = actualChildNode as DefaultLambdaFunctionNode
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
        const testNode = new ThrowErrorDefaultLambdaFunctionGroupNode(
            new DefaultRegionNode(new RegionInfo('code', 'name'))
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
