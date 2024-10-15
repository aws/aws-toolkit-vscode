/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import {
    appRunnerType,
    ecrRepositoryType,
    s3BucketType,
    SERVERLESS_FUNCTION_TYPE,
} from '../../../../../shared/cloudformation/cloudformation'
import assert from 'assert'
import { ResourceTreeEntity, SamAppLocation } from '../../../../../awsService/appBuilder/explorer/samProject'
import { generateResourceNodes, ResourceNode } from '../../../../../awsService/appBuilder/explorer/nodes/resourceNode'
import { getIcon } from '../../../../../shared/icons'
import * as DeployedResourceNodeModule from '../../../../../awsService/appBuilder/explorer/nodes/deployedNode'
import * as sinon from 'sinon'
import { afterEach } from 'mocha'
import { DeployedResourceNode } from '../../../../../awsService/appBuilder/explorer/nodes/deployedNode'
import { PropertyNode } from '../../../../../awsService/appBuilder/explorer/nodes/propertyNode'
import { StackResource } from '../../../../../lambda/commands/listSamResources'

describe('ResourceNode', () => {
    const lambdaResourceTreeEntity = {
        Id: 'MyFunction',
        Type: SERVERLESS_FUNCTION_TYPE,
        Runtime: 'python3.12',
        Handler: 'app.lambda_handler',
        Events: [
            {
                Id: 'FileUpload',
                Type: 'S3',
                Path: undefined,
                Method: undefined,
            },
        ],
    }
    const workspaceFolder = {
        uri: vscode.Uri.parse('myworkspace'),
        name: 'my-workspace',
        index: 0,
    }
    const samAppLocation = {
        samTemplateUri: vscode.Uri.parse('myworkspace/myprojectrootfolder/template.yaml'),
        workspaceFolder,
        projectRoot: vscode.Uri.parse('myworkspace/myprojectrootfolder'),
    }
    const stackName = 'MyStack'
    const region = 'us-west-2'
    const functionArn = 'arn:aws:lambda:us-west-2:123456789012:function:MyFunction'
    const lambdaDeployedResource = {
        LogicalResourceId: 'MyFunction',
        PhysicalResourceId: functionArn,
    }

    describe('constructor', () => {
        it('should create a ResourceNode with correct all optional properties', () => {
            const resourceNode = new ResourceNode(
                samAppLocation,
                lambdaResourceTreeEntity,
                stackName,
                region,
                lambdaDeployedResource
            )

            validateNodeBasics(resourceNode, samAppLocation, lambdaResourceTreeEntity)
            validateDeployedResourceProps(resourceNode, stackName, region, lambdaDeployedResource)
        })

        it('should create a ResourceNode with correct properties with only required parameters', () => {
            const resourceNode = new ResourceNode(samAppLocation, lambdaResourceTreeEntity)
            validateNodeBasics(resourceNode, samAppLocation, lambdaResourceTreeEntity)
            validateEmptyStackProps(resourceNode)
            validateEmptyDeployedResourceProps(resourceNode)
        })
    })

    describe('getChildren', () => {
        const nonLambdaResourceTreeEntity = {
            Id: 'MyS3Bucket',
            Type: s3BucketType,
        }
        const s3Arn = 'arn:aws:s3:::my-example-bucket'
        const nonLambdaDeployedResource = {
            LogicalResourceId: 'MyS3BucketId',
            PhysicalResourceId: s3Arn,
        }

        let generateDeployedNodeStub: sinon.SinonStub
        const mockDeployedNodeInstance = sinon.createStubInstance(DeployedResourceNodeModule.DeployedResourceNode)

        beforeEach(() => {
            generateDeployedNodeStub = sinon.stub(DeployedResourceNodeModule, 'generateDeployedNode')
        })

        afterEach(() => {
            sinon.restore()
        })

        it('should generate deployed nodes and property nodes for deployed lambda function', async () => {
            // stub generateDeployedNode() call and return mock deploy
            generateDeployedNodeStub.resolves([mockDeployedNodeInstance])

            const resourceNode = new ResourceNode(
                samAppLocation,
                lambdaResourceTreeEntity,
                stackName,
                region,
                lambdaDeployedResource
            )
            const childrenNodes = await resourceNode.getChildren()
            assert(
                generateDeployedNodeStub.calledOnceWith(
                    lambdaDeployedResource,
                    region,
                    stackName,
                    lambdaResourceTreeEntity
                )
            )
            assert(childrenNodes.length === 3)
            assert(childrenNodes.filter((node) => node instanceof DeployedResourceNode).length === 1)
            // Validate 2 property node for Lambda `Runtime` and `Handler` properties
            assert(childrenNodes.filter((node) => node instanceof PropertyNode).length === 2)
        })

        it('should generate deployed nodes without property nodes for deployed non lambda function', async () => {
            // stub generateDeployedNode() call and return mock deploy
            generateDeployedNodeStub.resolves([mockDeployedNodeInstance])
            const resourceNode = new ResourceNode(
                samAppLocation,
                nonLambdaResourceTreeEntity,
                stackName,
                region,
                nonLambdaDeployedResource
            )
            const childrenNodes = await resourceNode.getChildren()
            assert(
                generateDeployedNodeStub.calledOnceWith(
                    nonLambdaDeployedResource,
                    region,
                    stackName,
                    nonLambdaResourceTreeEntity
                )
            )
            assert(childrenNodes.length === 1)
            assert(childrenNodes[0] instanceof DeployedResourceNode)
        })

        it('should generate empty array for non-deployed non lambda resource', async () => {
            const resourceNode = new ResourceNode(samAppLocation, nonLambdaResourceTreeEntity)
            assert(generateDeployedNodeStub.notCalled)
            const childrenNodes = await resourceNode.getChildren()
            assert(childrenNodes.length === 0)
        })
    })

    describe('getIconPath', () => {
        const testCase = [
            { type: SERVERLESS_FUNCTION_TYPE, expectedIconKey: 'aws-lambda-function' },
            { type: s3BucketType, expectedIconKey: 'aws-s3-bucket' },
            { type: appRunnerType, expectedIconKey: 'aws-apprunner-service' },
            { type: ecrRepositoryType, expectedIconKey: 'aws-ecr-registry' },
            { type: 'Unsupported', expectedIconKey: 'info' },
        ]

        testCase.map((test) => {
            it(`should generate correct icon path for ${test.type}`, () => {
                const resourceNode = new ResourceNode(samAppLocation, { Id: 'MyResource', Type: test.type })
                // Access the private method using TypeScript's type assertion
                const getIconPath = (resourceNode as any).getIconPath.bind(resourceNode)
                const iconPath = getIconPath()
                assert.strictEqual(iconPath.id, test.expectedIconKey)
            })
        })
    })

    describe('getTreeItem', () => {
        it('should generate correct TreeItem without none collapsible state given no deployed resource', () => {
            const resourceNode = new ResourceNode(samAppLocation, lambdaResourceTreeEntity)
            const treeItem = resourceNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'MyFunction')
            assert.strictEqual(treeItem.tooltip, samAppLocation.samTemplateUri.toString())
            assert.strictEqual(treeItem.resourceUri, samAppLocation.samTemplateUri)
            assert.strictEqual(treeItem.contextValue, 'awsAppBuilderResourceNode.function')
            assert.strictEqual(treeItem.iconPath, getIcon('aws-lambda-function'))
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
        })

        it('should generate correct TreeItem without collapsed  state given node with deployed resource', () => {
            const resourceNode = new ResourceNode(
                samAppLocation,
                lambdaResourceTreeEntity,
                stackName,
                region,
                lambdaDeployedResource,
                functionArn
            )
            const treeItem = resourceNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'MyFunction')
            assert.strictEqual(treeItem.tooltip, samAppLocation.samTemplateUri.toString())
            assert.strictEqual(treeItem.resourceUri, samAppLocation.samTemplateUri)
            assert.strictEqual(treeItem.contextValue, 'awsAppBuilderResourceNode.function')
            assert.strictEqual(treeItem.iconPath, getIcon('aws-lambda-function'))
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })
    })

    describe('generateResourceNodes', () => {
        it('should generate correct ResourceNodes without deployed resource', () => {
            const resources: ResourceTreeEntity[] = [lambdaResourceTreeEntity, lambdaResourceTreeEntity]
            const resourceNodes = generateResourceNodes(samAppLocation, resources)

            assert(resourceNodes.length === 2)
            resourceNodes.map((resourceNode) => {
                assert(resourceNode instanceof ResourceNode)
                validateNodeBasics(resourceNode, samAppLocation, lambdaResourceTreeEntity)
                validateEmptyStackProps(resourceNode)
                validateEmptyDeployedResourceProps(resourceNode)
            })
        })
    })

    it('should generate correct ResourceNodes with deployed resources without valid type', () => {
        const resourceTreeEntityWithoutType = {
            Id: 'MyFunction',
            Type: '',
        }

        const resources: ResourceTreeEntity[] = [resourceTreeEntityWithoutType, resourceTreeEntityWithoutType]
        const resourceNodes = generateResourceNodes(samAppLocation, resources, stackName, region)

        assert(resourceNodes.length === 2)

        resourceNodes.map((resourceNode) => {
            assert(resourceNode instanceof ResourceNode)
            validateNodeBasics(resourceNode, samAppLocation, resourceTreeEntityWithoutType)
            assert.strictEqual(resourceNode.resource.stackName, stackName)
            assert.strictEqual(resourceNode.resource.region, region)
            validateEmptyDeployedResourceProps(resourceNode)
        })
    })

    it('should generate correct ResourceNodes with deployed resources and valid resource type', () => {
        const resources: ResourceTreeEntity[] = [lambdaResourceTreeEntity]
        const resourceNodes = generateResourceNodes(samAppLocation, resources, stackName, region, [
            lambdaDeployedResource,
        ])

        assert.strictEqual(resourceNodes.length, 1)
        resourceNodes.map((resourceNode) => {
            assert(resourceNode instanceof ResourceNode)
            validateNodeBasics(resourceNode, samAppLocation, lambdaResourceTreeEntity)
            validateDeployedResourceProps(resourceNode, stackName, region, lambdaDeployedResource)
        })
    })
})

function validateEmptyDeployedResourceProps(resourceNode: ResourceNode) {
    assert(!resourceNode.resourceLogicalId)
    assert(!resourceNode.resource.deployedResource)
}

function validateEmptyStackProps(resourceNode: ResourceNode) {
    assert(!resourceNode.resource.stackName)
    assert(!resourceNode.resource.region)
}

function validateNodeBasics(
    resourceNode: ResourceNode,
    samAppLocation: SamAppLocation,
    resourceTreeEntity: ResourceTreeEntity
) {
    assert.strictEqual(resourceNode.id, resourceTreeEntity.Id)
    assert.strictEqual(resourceNode.resource.resource, resourceTreeEntity)
    assert.strictEqual(resourceNode.resource.location, samAppLocation.samTemplateUri)
    assert.strictEqual(resourceNode.resource.workspaceFolder, samAppLocation.workspaceFolder)
}
function validateDeployedResourceProps(
    resourceNode: ResourceNode,
    stackName: string,
    region: string,
    lambdaDeployedResource: StackResource
) {
    assert.strictEqual(resourceNode.resource.region, region)
    assert.strictEqual(resourceNode.resource.stackName, stackName)
    assert.strictEqual(resourceNode.resourceLogicalId, lambdaDeployedResource.LogicalResourceId)
    assert.strictEqual(resourceNode.resource.deployedResource, lambdaDeployedResource)
}
