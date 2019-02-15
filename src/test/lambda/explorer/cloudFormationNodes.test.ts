/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import { TreeItem, Uri } from 'vscode'
import {
    CloudFormationStackNode,
    DefaultCloudFormationFunctionNode,
    DefaultCloudFormationNode,
    DefaultCloudFormationStackNode
} from '../../../lambda/explorer/cloudFormationNodes'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { ErrorNode } from '../../../lambda/explorer/errorNode'
import { PlaceholderNode } from '../../../lambda/explorer/placeholderNode'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { ext } from '../../../shared/extensionGlobals'
import { RegionInfo } from '../../../shared/regions/regionInfo'

describe('DefaultCloudFormationStackNode', () => {

    let fakeStackSummary: CloudFormation.StackSummary
    const fakeIconPathPrefix: string = 'DefaultCloudFormationStackNode'

    before(() => {
        fakeStackSummary = {
            CreationTime: new Date(),
            StackId: '1',
            StackName: 'myStack',
            StackStatus: 'UPDATE_COMPLETE'
        }
    })

    // Validates we tagged the node correctly.
    it('initializes name and tooltip', async () => {
        const testNode: CloudFormationStackNode = generateTestNode()

        assert.strictEqual(testNode.label, `${fakeStackSummary.StackName} [${fakeStackSummary.StackStatus}]`)
        assert.strictEqual(testNode.tooltip, `${fakeStackSummary.StackName}-${fakeStackSummary.StackId}`)
    })

    it('initializes icon', async () => {
        const testNode: CloudFormationStackNode = generateTestNode()

        validateIconPath(testNode)
    })

    it('returns placeholder node if no children are present', async () => {
        const cloudFormationClient = {
            regionCode: 'code',

            async describeStackResources(name: string): Promise<CloudFormation.DescribeStackResourcesOutput> {
                return {
                    StackResources: []
                }
            }

        } as any as CloudFormationClient

        const lambdaClient = {
            regionCode: 'code',

            async *listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration> {
                yield* []
            }
        } as any as LambdaClient

        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                return cloudFormationClient
            },

            createLambdaClient(regionCode: string): LambdaClient {
                return lambdaClient
            }
        }
        const testNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PlaceholderNode, true)
    })

    it('only includes functions which are in a CloudFormation stack', async () => {
        class MockCloudFormationClient implements CloudFormationClient {
            private readonly resources: CloudFormation.StackResource[] = []

            public constructor(public readonly regionCode: string) {
            }

            public async deleteStack(name: string): Promise<void> {
            }

            public async *listStacks(statusFilter?: string[]): AsyncIterableIterator<CloudFormation.StackSummary> {
                yield* []
            }

            public async describeStackResources(name: string): Promise<CloudFormation.DescribeStackResourcesOutput> {
                return {
                    StackResources: this.resources
                }
            }

            public addLambdaResource(name: string): void {
                this.resources.push({
                    ResourceType: 'Lambda::Function',
                    PhysicalResourceId: name
                } as any as CloudFormation.StackResource)
            }
        }

        class MockLambdaClient implements LambdaClient {
            private readonly lambdas: Lambda.FunctionConfiguration[] = []

            public constructor(public readonly regionCode: string) {
            }

            public async deleteFunction(name: string): Promise<void> {

            }

            public async getFunctionConfiguration(name: string): Promise<Lambda.FunctionConfiguration> {
                return this.lambdas.find(l => l.FunctionName === name) || {} as any as Lambda.FunctionConfiguration
            }

            public async invoke(name: string, payload?: Lambda._Blob): Promise<Lambda.InvocationResponse> {
                return {} as any as Lambda.InvocationResponse
            }

            public async getPolicy(name: string): Promise<Lambda.GetPolicyResponse> {
                return {} as any as Lambda.GetPolicyResponse
            }

            public async *listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration> {
                yield* this.lambdas
            }

            public addLambdaResource(name: string): void {
                this.lambdas.push({
                    FunctionName: name
                } as any as Lambda.FunctionConfiguration)
            }
        }

        const lambda1Name = 'lambda1Name'
        const lambda2Name = 'lambda2Name'
        const lambda3Name = 'lambda3Name'

        const cloudFormationClient = new MockCloudFormationClient('code')
        cloudFormationClient.addLambdaResource(lambda1Name)
        cloudFormationClient.addLambdaResource(lambda3Name)

        const lambdaClient = new MockLambdaClient('code')
        lambdaClient.addLambdaResource(lambda1Name)
        lambdaClient.addLambdaResource(lambda2Name)
        lambdaClient.addLambdaResource(lambda3Name)

        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                return cloudFormationClient
            },

            createLambdaClient(regionCode: string): LambdaClient {
                return lambdaClient
            }
        }

        const testNode: CloudFormationStackNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 2)

        assert(childNodes[0] instanceof DefaultCloudFormationFunctionNode)
        assert.strictEqual((childNodes[0] as DefaultCloudFormationFunctionNode).label, lambda1Name)

        assert(childNodes[1] instanceof DefaultCloudFormationFunctionNode)
        assert.strictEqual((childNodes[1] as DefaultCloudFormationFunctionNode).label, lambda3Name)
    })

    function validateIconPath(
        node: TreeItem
    ) {
        const fileScheme: string = 'file'
        const expectedPrefix = `/${fakeIconPathPrefix}/`

        assert(node.iconPath !== undefined)
        const iconPath = node.iconPath! as {
            light: Uri,
            dark: Uri
        }

        assert(iconPath.light !== undefined)
        assert(iconPath.light instanceof Uri)
        assert.strictEqual(iconPath.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath.light.path
        assert(
            lightResourcePath.indexOf(expectedPrefix) >= 0,
            `expected light resource path ${lightResourcePath} to contain ${expectedPrefix}`
        )
        assert(
            lightResourcePath.indexOf('/light/') >= 0,
            `expected light resource path ${lightResourcePath} to contain '/light/'`
        )

        assert(iconPath.dark !== undefined)
        assert(iconPath.dark instanceof Uri)
        assert.strictEqual(iconPath.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath.dark.path
        assert(
            darkResourcePath.indexOf(expectedPrefix) >= 0,
            `expected dark resource path ${darkResourcePath} to contain ${expectedPrefix}`
        )
        assert(
            darkResourcePath.indexOf('/dark/') >= 0,
            `expected light resource path ${darkResourcePath} to contain '/dark/'`
        )
    }

    function generateTestNode(): CloudFormationStackNode {
        return new DefaultCloudFormationStackNode(
            new DefaultCloudFormationNode(
                new DefaultRegionNode(new RegionInfo('code', 'name'), iconPathMaker),
                iconPathMaker
            ),
            fakeStackSummary,
            iconPathMaker
        )
    }

    function iconPathMaker(relativePath: string): string {
        return `${fakeIconPathPrefix}/${relativePath}`
    }
})

describe('DefaultCloudFormationNode', () => {

    it('handles error', async () => {

        const unusedPathResolver = () => { throw new Error('unused') }

        class ThrowErrorDefaultCloudFormationNode extends DefaultCloudFormationNode {
            public constructor(
                public readonly regionNode: DefaultRegionNode
            ) {
                super(regionNode, unusedPathResolver)
            }

            public async updateChildren(): Promise<void> {
                throw new Error('Hello there!')
            }
        }

        const testNode: ThrowErrorDefaultCloudFormationNode = new ThrowErrorDefaultCloudFormationNode(
            new DefaultRegionNode(new RegionInfo('code', 'name'), unusedPathResolver)
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })

})
