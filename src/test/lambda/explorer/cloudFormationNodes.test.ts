/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import '../../shared/vscode/initialize'

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import {
    CloudFormationStackNode,
    DefaultCloudFormationFunctionNode,
    DefaultCloudFormationNode,
    DefaultCloudFormationStackNode
} from '../../../lambda/explorer/cloudFormationNodes'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { PlaceholderNode } from '../../../lambda/explorer/placeholderNode'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { ext } from '../../../shared/extensionGlobals'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { types as vscode } from '../../../shared/vscode'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('DefaultCloudFormationStackNode', () => {
    let fakeStackSummary: CloudFormation.StackSummary

    class FakeExtensionContextOverride extends FakeExtensionContext {

        public asAbsolutePath(relativePath: string): string {
            return relativePath
        }
    }

    before(() => {
        ext.context = new FakeExtensionContextOverride()
        fakeStackSummary = {
            CreationTime: new Date(),
            StackId: '1',
            StackName: 'myStack',
            StackStatus: 'UPDATE_COMPLETE'
        }
    })

    // Validates we tagged the node correctly.
    it('initializes name and tooltip', async () => {
        const testNode: CloudFormationStackNode = new DefaultCloudFormationStackNode(
            new DefaultCloudFormationNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeStackSummary
        )

        assert.strictEqual(testNode.label, `${fakeStackSummary.StackName} [${fakeStackSummary.StackStatus}]`)
        assert.strictEqual(testNode.tooltip, `${fakeStackSummary.StackName}-${fakeStackSummary.StackId}`)
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
        const testNode = new DefaultCloudFormationStackNode(
            new DefaultCloudFormationNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeStackSummary
        )

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

        const testNode: CloudFormationStackNode = new DefaultCloudFormationStackNode(
            new DefaultCloudFormationNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeStackSummary
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 2)

        assert(childNodes[0] instanceof DefaultCloudFormationFunctionNode)
        assert.strictEqual((childNodes[0] as DefaultCloudFormationFunctionNode).label, lambda1Name)

        assert(childNodes[1] instanceof DefaultCloudFormationFunctionNode)
        assert.strictEqual((childNodes[1] as DefaultCloudFormationFunctionNode).label, lambda3Name)
    })

    // Validates we wired up the expected resource for the node icon
    it('initializes icon path', async () => {

        const fileScheme: string = 'file'
        const resourceImageName: string = 'cloudformation.svg'

        const testNode = new DefaultCloudFormationStackNode(
            new DefaultCloudFormationNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeStackSummary
        )

        const iconPath = testNode.iconPath as {
            light: vscode.Uri,
            dark: vscode.Uri
        }
        assert(!!iconPath)

        assert(!!iconPath.light)
        assert.strictEqual(iconPath!.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath!.light.path
        assert(lightResourcePath.endsWith(`/light/${resourceImageName}`))

        assert(!!iconPath.dark)
        assert.strictEqual(iconPath!.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath!.dark.path
        assert(darkResourcePath.endsWith(`dark/${resourceImageName}`))
    })

})
