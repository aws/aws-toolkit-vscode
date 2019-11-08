/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import * as os from 'os'
import * as sinon from 'sinon'
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
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'
import { assertChildNodesOnlyContainErrorNode } from './explorerNodeAssertions'

async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

const FAKE_REGION_CODE = 'someregioncode'

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
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('has CloudFormationStackNode child nodes', async () => {
        const inputStackNames: string[] = ['stack123']

        const cloudFormationClient = makeCloudFormationClient(inputStackNames)

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient)
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder

        const cloudFormationNode = new CloudFormationNode(FAKE_REGION_CODE)

        const children = await cloudFormationNode.getChildren()

        children.forEach(node =>
            assert.ok(node instanceof CloudFormationStackNode, 'Expected child node to be CloudFormationStackNode')
        )
    })

    it('has sorted child nodes', async () => {
        const inputStackNames = ['zebra', 'Antelope', 'aardvark', 'elephant']
        const expectedChildOrder = ['aardvark', 'Antelope', 'elephant', 'zebra']

        const cloudFormationClient = makeCloudFormationClient(inputStackNames)

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient)
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder

        const cloudFormationNode = new CloudFormationNode(FAKE_REGION_CODE)

        const children = await cloudFormationNode.getChildren()

        const actualChildOrder = children.map(node => (node as CloudFormationStackNode).stackName)

        assert.deepStrictEqual(actualChildOrder, expectedChildOrder, 'Unexpected child sort order')
    })

    it('handles error', async () => {
        const testNode = new CloudFormationNode(FAKE_REGION_CODE)
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update Children error!')
        })

        const childNodes: AWSTreeNodeBase[] = await testNode.getChildren()
        assertChildNodesOnlyContainErrorNode(childNodes)
    })

    function makeCloudFormationClient(stackNames: string[]): any {
        return {
            listStacks: sandbox.stub().callsFake(() => {
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
            })
        }
    }
})
