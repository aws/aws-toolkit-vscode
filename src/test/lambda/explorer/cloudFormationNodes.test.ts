/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import * as os from 'os'
import {
    CloudFormationNode,
    CloudFormationStackNode,
    CONTEXT_VALUE_CLOUDFORMATION_LAMBDA_FUNCTION
} from '../../../lambda/explorer/cloudFormationNodes'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { EcsClient } from '../../../shared/clients/ecsClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ext } from '../../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { MockCloudFormationClient } from '../../shared/clients/mockClients'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'

async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

describe('CloudFormationStackNode', () => {
    let fakeStackSummary: CloudFormation.StackSummary

    before(async () => {
        setupTestIconPaths()
        fakeStackSummary = {
            CreationTime: new Date(),
            StackId: '1',
            StackName: 'myStack',
            StackStatus: 'UPDATE_COMPLETE'
        }
    })

    after(async () => {
        clearTestIconPaths()
    })

    // Validates we tagged the node correctly.
    it('initializes name and tooltip', async () => {
        const testNode: CloudFormationStackNode = generateTestNode()

        assert.strictEqual(testNode.label, `${fakeStackSummary.StackName} [${fakeStackSummary.StackStatus}]`)
        assert.strictEqual(testNode.tooltip, `${fakeStackSummary.StackName}${os.EOL}${fakeStackSummary.StackId}`)
    })

    it('initializes icon', async () => {
        const testNode: CloudFormationStackNode = generateTestNode()

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.cloudFormation, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.cloudFormation, 'Unexpected light icon path')
    })

    it('returns placeholder node if no children are present', async () => {
        const cloudFormationClient = ({
            regionCode: 'code',

            async describeStackResources(name: string): Promise<CloudFormation.DescribeStackResourcesOutput> {
                return {
                    StackResources: []
                }
            }
        } as any) as CloudFormationClient

        const lambdaClient = ({
            regionCode: 'code',

            async *listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration> {
                yield* []
            }
        } as any) as LambdaClient

        // TODO: Move this to MockToolkitClientBuilder
        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                return cloudFormationClient
            },

            createEcsClient(regionCode: string): EcsClient {
                throw new Error('ecs client unused')
            },

            createLambdaClient(regionCode: string): LambdaClient {
                return lambdaClient
            },

            createStsClient(regionCode: string): StsClient {
                throw new Error('sts client unused')
            }
        }
        const testNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PlaceholderNode, true)
    })

    it('only includes functions which are in a CloudFormation stack', async () => {
        class TestMockCloudFormationClient implements CloudFormationClient {
            private readonly resources: CloudFormation.StackResource[] = []

            public constructor(public readonly regionCode: string) {}

            public async deleteStack(name: string): Promise<void> {}

            public async *listStacks(statusFilter?: string[]): AsyncIterableIterator<CloudFormation.StackSummary> {
                yield* []
            }

            public async describeStackResources(name: string): Promise<CloudFormation.DescribeStackResourcesOutput> {
                return {
                    StackResources: this.resources
                }
            }

            public addLambdaResource(name: string): void {
                this.resources.push(({
                    ResourceType: 'Lambda::Function',
                    PhysicalResourceId: name
                } as any) as CloudFormation.StackResource)
            }
        }

        class MockLambdaClient implements LambdaClient {
            private readonly lambdas: Lambda.FunctionConfiguration[] = []

            public constructor(public readonly regionCode: string) {}

            public async deleteFunction(name: string): Promise<void> {}

            public async invoke(name: string, payload?: Lambda._Blob): Promise<Lambda.InvocationResponse> {
                return ({} as any) as Lambda.InvocationResponse
            }

            public async *listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration> {
                yield* this.lambdas
            }

            public addLambdaResource(name: string): void {
                this.lambdas.push(({
                    FunctionName: name
                } as any) as Lambda.FunctionConfiguration)
            }
        }

        const lambda1Name = 'lambda1Name'
        const lambda2Name = 'lambda2Name'
        const lambda3Name = 'lambda3Name'

        const cloudFormationClient = new TestMockCloudFormationClient('code')
        cloudFormationClient.addLambdaResource(lambda1Name)
        cloudFormationClient.addLambdaResource(lambda3Name)

        const lambdaClient = new MockLambdaClient('code')
        lambdaClient.addLambdaResource(lambda1Name)
        lambdaClient.addLambdaResource(lambda2Name)
        lambdaClient.addLambdaResource(lambda3Name)

        // TODO: Move to MockToolkitClientBuilder
        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                return cloudFormationClient
            },

            createEcsClient(regionCode: string): EcsClient {
                throw new Error('ecs client unused')
            },

            createLambdaClient(regionCode: string): LambdaClient {
                return lambdaClient
            },

            createStsClient(regionCode: string): StsClient {
                throw new Error('sts client unused')
            }
        }

        const testNode: CloudFormationStackNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 2)

        assertCloudFormationLambdaFunctionNode(childNodes[0], lambda1Name)
        assertCloudFormationLambdaFunctionNode(childNodes[1], lambda3Name)
    })

    function generateTestNode(): CloudFormationStackNode {
        const parentNode = new TestAWSTreeNode('test node')

        return new CloudFormationStackNode(parentNode, 'someregioncode', fakeStackSummary)
    }

    function assertCloudFormationLambdaFunctionNode(actualNode: AWSTreeNodeBase, expectedLabel: string) {
        assert.ok(actualNode instanceof LambdaFunctionNode)
        assert.strictEqual(actualNode.label, expectedLabel, 'unexpected label for Lambda Function Node')
        assert.strictEqual(
            actualNode.contextValue,
            CONTEXT_VALUE_CLOUDFORMATION_LAMBDA_FUNCTION,
            'expected the node to have a CloudFormation contextValue'
        )
    }
})

describe('CloudFormationNode', () => {
    class StackNamesMockCloudFormationClient extends MockCloudFormationClient {
        public constructor(
            public readonly stackNames: string[] = [],
            listStacks: (statusFilter?: string[]) => AsyncIterableIterator<CloudFormation.StackSummary> = (
                statusFilter?: string[]
            ) => {
                return asyncGenerator<CloudFormation.StackSummary>(
                    stackNames.map<CloudFormation.StackSummary>(name => {
                        return {
                            StackId: name,
                            StackName: name,
                            CreationTime: new Date(),
                            StackStatus: 'CREATE_COMPLETE'
                        }
                    })
                )
            }
        ) {
            super(undefined, undefined, listStacks)
        }
    }

    it('Sorts Stacks', async () => {
        const inputStackNames: string[] = ['zebra', 'Antelope', 'aardvark', 'elephant']

        // TODO: Move to MockToolkitClientBuilder
        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                return new StackNamesMockCloudFormationClient(inputStackNames)
            },

            createEcsClient(regionCode: string): EcsClient {
                throw new Error('ecs client unused')
            },

            createLambdaClient(regionCode: string): LambdaClient {
                throw new Error('lambda client unused')
            },

            createStsClient(regionCode: string): StsClient {
                throw new Error('sts client unused')
            }
        }

        const cloudFormationNode = new CloudFormationNode('someregioncode')

        const children = await cloudFormationNode.getChildren()

        assert.ok(children, 'Expected to get CloudFormation node children')
        assert.strictEqual(
            inputStackNames.length,
            children.length,
            `Expected ${inputStackNames.length} CloudFormation children, got ${children.length}`
        )

        function assertChildNodeStackName(
            actualChildNode: CloudFormationStackNode | ErrorNode,
            expectedNodeText: string
        ) {
            assert.strictEqual(
                actualChildNode instanceof CloudFormationStackNode,
                true,
                'Child node was not a Stack Node'
            )

            const node = actualChildNode as CloudFormationStackNode
            assert.strictEqual(
                node.stackName,
                expectedNodeText,
                `Expected child node to have stack ${expectedNodeText} but got ${node.stackName}`
            )
        }

        assertChildNodeStackName(children[0], 'aardvark')
        assertChildNodeStackName(children[1], 'Antelope')
        assertChildNodeStackName(children[2], 'elephant')
        assertChildNodeStackName(children[3], 'zebra')
    })

    it('handles error', async () => {
        class ThrowErrorCloudFormationNode extends CloudFormationNode {
            public constructor() {
                super('someregioncode')
            }

            public async updateChildren(): Promise<void> {
                throw new Error('Hello there!')
            }
        }

        const testNode: ThrowErrorCloudFormationNode = new ThrowErrorCloudFormationNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
