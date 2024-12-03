/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as vscode from 'vscode'
import * as os from 'os'
import {
    DeployedResource,
    DeployedResourceNode,
    generateDeployedNode,
} from '../../../../../awsService/appBuilder/explorer/nodes/deployedNode'
import * as sinon from 'sinon'
import * as LambdaClientModule from '../../../../../../src/shared/clients/lambdaClient'
import * as DefaultS3ClientModule from '../../../../../../src/shared/clients/s3Client'
import * as ApiGatewayNodeModule from '../../../../../awsService/apigateway/explorer/apiGatewayNodes'
import { beforeEach } from 'mocha'
import { LambdaFunctionNode } from '../../../../../lambda/explorer/lambdaFunctionNode'
import { RestApiNode } from '../../../../../awsService/apigateway/explorer/apiNodes'
import { S3BucketNode } from '../../../../../awsService/s3/explorer/s3BucketNode'
import * as LambdaNodeModule from '../../../../../lambda/explorer/lambdaNodes'
import { getIcon } from '../../../../../shared/icons'
import _ from 'lodash'
import { isTreeNode } from '../../../../../shared/treeview/resourceTreeDataProvider'
import { Any } from '../../../../../shared/utilities/typeConstructors'
import { IamConnection, ProfileMetadata } from '../../../../../auth/connection'
import * as AuthUtils from '../../../../../auth/utils'
import { assertLogsContain } from '../../../../../test/globalSetup.test'

describe('DeployedResourceNode', () => {
    const expectedStackName = 'myStack'
    const expectedRegionCode = 'us-west-2'

    beforeEach(() => {})

    afterEach(() => {
        // Restore the original function after each test
        sinon.restore()
    })

    const getDeployedResource = (explorerNode: any, resourceArn: string, contextValue: string): DeployedResource => {
        return {
            stackName: expectedStackName,
            regionCode: expectedRegionCode,
            explorerNode: explorerNode,
            arn: resourceArn,
            contextValue: contextValue,
        } as DeployedResource
    }
    const testCases = [
        {
            explorerNode: sinon.stub(LambdaFunctionNode),
            resourceArn: 'arn:aws:lambda:us-east-1:123456789012:function:my-function-name',
            contextValue: 'awsRegionFunctionNodeDownloadable',
        },
        {
            explorerNode: sinon.stub(S3BucketNode),
            resourceArn: 'arn:aws:s3:::my-bucket-name',
            contextValue: 'awsS3BucketNode',
        },
        {
            explorerNode: sinon.stub(RestApiNode),
            resourceArn: 'arn:aws:apigateway:us-east-1::/apis/my-apgw',
            contextValue: 'awsApiGatewayNode',
        },
    ].map(({ explorerNode, resourceArn, contextValue }) => getDeployedResource(explorerNode, resourceArn, contextValue))

    describe('constructor', () => {
        testCases.map((deployedResource: DeployedResource) => {
            it(`should create an instance of DeployedResourceNode for ${deployedResource.contextValue}`, () => {
                const deployedLambdaNode = new DeployedResourceNode(deployedResource)

                assert.strictEqual(deployedLambdaNode.id, deployedResource.arn)
                assert.strictEqual(deployedLambdaNode.contextValue, deployedResource.contextValue)
                assert.deepStrictEqual(deployedLambdaNode.resource, deployedResource)
            })

            it('should  create an instance with empty id and when resource arn is missing', () => {
                const emptyArnDeployedResource = _.cloneDeep(deployedResource)
                emptyArnDeployedResource.arn = ''
                const deployedLambdaNode = new DeployedResourceNode(emptyArnDeployedResource)

                assert.strictEqual(deployedLambdaNode.id, '')
                assert.strictEqual(deployedLambdaNode.contextValue, '')
                assert.deepStrictEqual(deployedLambdaNode.resource, emptyArnDeployedResource)
                assertLogsContain('Cannot create DeployedResourceNode, the ARN does not exist.', false, 'warn')
            })
        })
    })

    testCases.map((deployedResource: DeployedResource) => {
        const deployedLambdaNode = new DeployedResourceNode(deployedResource)
        describe('getChildren', () => {
            it('should return an empty array', async () => {
                const children = await deployedLambdaNode.getChildren()

                assert.deepStrictEqual(children, [])
            })
        })

        describe('getTreeItem', () => {
            it('should return a TreeItem with correct properties', () => {
                const treeItem = deployedLambdaNode.getTreeItem()
                const expectedIconPath = getIcon('vscode-cloud')

                assert.strictEqual(treeItem.label, deployedResource.arn)
                assert.strictEqual(treeItem.contextValue, deployedResource.contextValue)
                assert.deepStrictEqual(treeItem.iconPath, expectedIconPath)
                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
                assert.strictEqual(treeItem.tooltip, deployedResource.arn)
            })
        })
    })
})

describe('generateDeployedNode', () => {
    const expectedStackName = 'myStack'
    const expectedRegionCode = 'us-west-2'

    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        // Initiate stub sanbox
        sandbox = sinon.createSandbox()
        // Create a stub for the entire logger module
    })
    afterEach(async () => {
        sandbox.restore()
    })

    describe('LambdaFunctionNode', () => {
        let mockDefaultLambdaClientInstance: sinon.SinonStubbedInstance<LambdaClientModule.DefaultLambdaClient>
        let mockLambdaNodeInstance: sinon.SinonStubbedInstance<LambdaNodeModule.LambdaNode>
        const iamConnection: IamConnection & { readonly state: ProfileMetadata['connectionState'] } = {
            type: 'iam',
            id: '0',
            label: 'iam',
            getCredentials: sinon.stub(),
            state: 'valid',
        }

        const lambdaDeployedNodeInput = {
            deployedResource: {
                LogicalResourceId: 'MyLambdaFunction',
                PhysicalResourceId: 'my-project-lambda-physical-id',
            },
            regionCode: expectedRegionCode,
            stackName: expectedStackName,
            resourceTreeEntity: {
                Type: 'AWS::Serverless::Function',
            },
        }

        beforeEach(() => {
            // Stub the constructor of DefaultLambdaClient to return the stub instance
            mockDefaultLambdaClientInstance = sandbox.createStubInstance(LambdaClientModule.DefaultLambdaClient)
            sandbox.stub(LambdaClientModule, 'DefaultLambdaClient').returns(mockDefaultLambdaClientInstance)
            //  Stub the constructor of LambdaNode to return stub instance
            mockLambdaNodeInstance = sandbox.createStubInstance(LambdaNodeModule.LambdaNode)
            sandbox.stub(LambdaNodeModule, 'LambdaNode').returns(mockLambdaNodeInstance)
            sandbox.stub(AuthUtils, 'getIAMConnection').resolves(iamConnection)
        })

        it('should return a DeployedResourceNode for valid Lambda function happy path', async () => {
            // Simulate successful fetching Lambda function using DefaultLambdaClient
            const defaultLambdaClientGetFunctionResponse = {
                Configuration: {
                    FunctionName: 'my-project-lambda-function',
                    FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:my-project-lambda-function',
                    Runtime: 'python3.12',
                },
            } as AWS.Lambda.GetFunctionResponse

            mockDefaultLambdaClientInstance.getFunction.resolves(defaultLambdaClientGetFunctionResponse)

            const expectedFunctionArn = 'arn:aws:lambda:us-east-1:123456789012:function:my-project-lambda-function'
            const expectedFunctionName = 'my-project-lambda-function'
            const expectedFunctionExplorerNodeTooltip = `${expectedFunctionName}${os.EOL}${expectedFunctionArn}`

            const deployedResourceNodes = await generateDeployedNode(
                lambdaDeployedNodeInput.deployedResource,
                lambdaDeployedNodeInput.regionCode,
                lambdaDeployedNodeInput.stackName,
                lambdaDeployedNodeInput.resourceTreeEntity
            )

            const deployedResourceNodeExplorerNode: LambdaFunctionNode = validateBasicProperties(
                deployedResourceNodes,
                expectedFunctionArn,
                'awsRegionFunctionNodeDownloadable',
                expectedRegionCode,
                expectedStackName,
                LambdaFunctionNode
            )

            assert.strictEqual(deployedResourceNodeExplorerNode.contextValue, 'awsRegionFunctionNodeDownloadable')
            assert.strictEqual(deployedResourceNodeExplorerNode.label, expectedFunctionName)
            assert.strictEqual(deployedResourceNodeExplorerNode.iconPath, getIcon('aws-lambda-function'))
            assert.strictEqual(deployedResourceNodeExplorerNode.regionCode, expectedRegionCode)
            assert.strictEqual(deployedResourceNodeExplorerNode.tooltip, expectedFunctionExplorerNodeTooltip)
            assert.strictEqual(deployedResourceNodeExplorerNode.configuration.FunctionArn, expectedFunctionArn)
            assert.strictEqual(deployedResourceNodeExplorerNode.configuration.FunctionName, expectedFunctionName)
            assert.strictEqual(deployedResourceNodeExplorerNode.configuration.Runtime, 'python3.12')
        })

        it('should log error message given any lambda client error', async () => {
            // Simulate failure fetching Lambda function using DefaultLambdaClient
            mockDefaultLambdaClientInstance.getFunction.rejects()

            const deployedResourceNodes = await generateDeployedNode(
                lambdaDeployedNodeInput.deployedResource,
                lambdaDeployedNodeInput.regionCode,
                lambdaDeployedNodeInput.stackName,
                lambdaDeployedNodeInput.resourceTreeEntity
            )

            assertLogsContain('Error getting Lambda configuration', false, 'error')
            assert(deployedResourceNodes.length === 1)

            // Check placeholder propertries
            const deployedResourceNode = deployedResourceNodes[0] as DeployedResourceNode
            assert.strictEqual(deployedResourceNode.id, 'placeholder')
            assert.strictEqual(deployedResourceNode.resource, '[Failed to retrive deployed resource.]')
        })
    })

    describe('S3BucketNode', () => {
        let mockDefaultS3ClientInstance: sinon.SinonStubbedInstance<DefaultS3ClientModule.DefaultS3Client>
        const s3DeployedNodeInput = {
            deployedResource: {
                LogicalResourceId: 'MyS3SourceBucket',
                PhysicalResourceId: 'my-project-source-bucket-physical-id',
            },
            regionCode: expectedRegionCode,
            stackName: expectedStackName,
            resourceTreeEntity: {
                Type: 'AWS::S3::Bucket',
            },
        }

        it('should return a DeployedResourceNode for valid S3 bucket happy path', async () => {
            // Stub the constructor of DefaultLambdaClient to return the stub instance
            mockDefaultS3ClientInstance = sandbox.createStubInstance(DefaultS3ClientModule.DefaultS3Client)
            sandbox.stub(DefaultS3ClientModule, 'DefaultS3Client').returns(mockDefaultS3ClientInstance)
            const deployedResourceNodes = await generateDeployedNode(
                s3DeployedNodeInput.deployedResource,
                s3DeployedNodeInput.regionCode,
                s3DeployedNodeInput.stackName,
                s3DeployedNodeInput.resourceTreeEntity
            )

            const expectedS3BucketArn = 'arn:aws:s3:::my-project-source-bucket-physical-id'
            const expectedS3BucketName = 'my-project-source-bucket-physical-id'

            const deployedResourceNodeExplorerNode: S3BucketNode = validateBasicProperties(
                deployedResourceNodes,
                expectedS3BucketArn,
                'awsS3BucketNode',
                expectedRegionCode,
                expectedStackName,
                S3BucketNode
            )
            assert.strictEqual(deployedResourceNodeExplorerNode.bucket.name, expectedS3BucketName)
            assert.strictEqual(deployedResourceNodeExplorerNode.bucket.arn, expectedS3BucketArn)
            assert.strictEqual(deployedResourceNodeExplorerNode.bucket.region, expectedRegionCode)
            assert.strictEqual(deployedResourceNodeExplorerNode.contextValue, 'awsS3BucketNode')
            assert.strictEqual(deployedResourceNodeExplorerNode.label, expectedS3BucketName)
            assert.strictEqual(deployedResourceNodeExplorerNode.tooltip, expectedS3BucketName)
            assert.strictEqual(deployedResourceNodeExplorerNode.iconPath, getIcon('aws-s3-bucket'))
        })
    })

    describe('ApiGatewayNode', () => {
        let mockApiGatewayNodeInstance: sinon.SinonStubbedInstance<ApiGatewayNodeModule.ApiGatewayNode>

        const apigatewayDeployedNodeInput = {
            deployedResource: {
                LogicalResourceId: 'MyRestApi',
                PhysicalResourceId: 'my-project-apigw-physical-id',
            },
            regionCode: expectedRegionCode,
            stackName: expectedStackName,
            resourceTreeEntity: {
                Type: 'AWS::Serverless::Api',
            },
        }

        const createMockRestApiNode = (
            sandbox: sinon.SinonSandbox,
            options: {
                id?: string
                name?: string
                description?: string
            }
        ) => {
            const mockNode = sandbox.createStubInstance(RestApiNode) as sinon.SinonStubbedInstance<RestApiNode> & {
                id?: string
                name?: string
                description?: string
            }
            Object.entries(options).forEach(([key, value]) => {
                value !== undefined && Object.defineProperty(mockNode, key, { value, writable: true })
            })
            return mockNode
        }

        it('should return a DeployedResourceNode for valid API Gateway happy path', async () => {
            // Stub the constructor of DefaultLambdaClient to return the stub instance
            mockApiGatewayNodeInstance = sandbox.createStubInstance(ApiGatewayNodeModule.ApiGatewayNode)
            sandbox.stub(ApiGatewayNodeModule, 'ApiGatewayNode').returns(mockApiGatewayNodeInstance)
            // Simulate successful fetching api gateway parentNode
            mockApiGatewayNodeInstance.getChildren.resolves([
                createMockRestApiNode(sandbox, { id: 'my-project-apigw-physical-id', name: 'targetAPI' }),
                createMockRestApiNode(sandbox, { id: 'my-project-apigw-other-id-2', name: 'otherAPI1' }),
                createMockRestApiNode(sandbox, { id: 'my-project-apigw-other-id-3', name: 'otherAPI2' }),
            ])

            const expectedApiGatewayArn = 'arn:aws:apigateway:us-west-2::/apis/my-project-apigw-physical-id'
            const expectedApiGatewayName = apigatewayDeployedNodeInput.deployedResource.PhysicalResourceId
            const expectedApiGatewayExplorerNodeLabel = 'targetAPI (my-project-apigw-physical-id)'

            const deployedResourceNodes = await generateDeployedNode(
                apigatewayDeployedNodeInput.deployedResource,
                apigatewayDeployedNodeInput.regionCode,
                apigatewayDeployedNodeInput.stackName,
                apigatewayDeployedNodeInput.resourceTreeEntity
            )

            const deployedResourceNodeExplorerNode: RestApiNode = validateBasicProperties(
                deployedResourceNodes,
                expectedApiGatewayArn,
                'awsApiGatewayNode',
                expectedRegionCode,
                expectedStackName,
                RestApiNode
            )

            assert.strictEqual(deployedResourceNodeExplorerNode.id, expectedApiGatewayName)
            assert.strictEqual(deployedResourceNodeExplorerNode.regionCode, expectedRegionCode)
            assert.strictEqual(deployedResourceNodeExplorerNode.partitionId, 'aws')
            assert.strictEqual(deployedResourceNodeExplorerNode.label, expectedApiGatewayExplorerNodeLabel)
            assert(!deployedResourceNodeExplorerNode.iconPath)
            assert(!deployedResourceNodeExplorerNode.tooltip)
        })
    })

    describe('UnsupportedResourceNode', () => {
        const unsupportTypeInput = {
            deployedResource: {
                LogicalResourceId: 'myUnsupportedResource',
                PhysicalResourceId: 'my-unsupported-resource-physical-id',
            },
            regionCode: expectedRegionCode,
            stackName: expectedStackName,
            resourceTreeEntity: {
                Type: 'AWS::Serverless::UnsupportType',
            },
        }

        it('should return a DeployedResourceNode with placeholder', async () => {
            const deployedResourceNodes = await generateDeployedNode(
                unsupportTypeInput.deployedResource,
                unsupportTypeInput.regionCode,
                unsupportTypeInput.stackName,
                unsupportTypeInput.resourceTreeEntity
            )

            assertLogsContain('Details are missing or are incomplete for:', false, 'info')

            // Check deployedResourceNodes array propertries
            assert(deployedResourceNodes.length === 1)
            assert(isTreeNode(deployedResourceNodes[0]))

            // Check placeholder propertries
            const deployedResourceNode = deployedResourceNodes[0] as DeployedResourceNode
            assert.strictEqual(deployedResourceNode.id, 'placeholder')
            assert.strictEqual(deployedResourceNode.resource, '[This resource is not yet supported.]')
        })
    })
})

function validateBasicProperties<T extends new (...args: any[]) => any>(
    deployedResourceNodes: DeployedResourceNode[],
    expectedArn: string,
    expectedContextValue: string,
    expectedRegionCode: string,
    expectedStackName: string,
    expectedExplorerNodeClass: T = Any as any
): InstanceType<T> {
    // Check deployedResourceNodes array propertries
    assert(deployedResourceNodes.length === 1)
    assert(deployedResourceNodes[0] instanceof DeployedResourceNode)

    // // Check deployedResourceNode propertries
    const deployedResourceNode = deployedResourceNodes[0] as DeployedResourceNode
    assert.strictEqual(deployedResourceNode.id, expectedArn)
    assert.strictEqual(deployedResourceNode.contextValue, expectedContextValue)

    // Check deployedResourceNode resource propertries
    const deployedResourceNodeResource = deployedResourceNode.resource
    assert.strictEqual(deployedResourceNodeResource.regionCode, expectedRegionCode)
    assert.strictEqual(deployedResourceNodeResource.stackName, expectedStackName)
    assert.strictEqual(deployedResourceNodeResource.contextValue, expectedContextValue)
    assert.strictEqual(deployedResourceNodeResource.arn, expectedArn)

    // Check deployedResourceNode resource explorer node propertries
    assert(deployedResourceNodeResource.explorerNode instanceof expectedExplorerNodeClass)
    return deployedResourceNodeResource.explorerNode as InstanceType<T>
}
