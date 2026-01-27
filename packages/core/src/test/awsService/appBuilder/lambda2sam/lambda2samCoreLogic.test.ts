/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import * as vscode from 'vscode'
import * as lambda2sam from '../../../../awsService/appBuilder/lambda2sam/lambda2sam'
import * as cloudFormation from '../../../../shared/cloudformation/cloudformation'
import * as utils from '../../../../awsService/appBuilder/utils'
import * as walkthrough from '../../../../awsService/appBuilder/walkthrough'
import * as authUtils from '../../../../auth/utils'
import { getTestWindow } from '../../../shared/vscode/window'
import { fs } from '../../../../shared'
import { DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import { LambdaFunctionNode } from '../../../../lambda/explorer/lambdaFunctionNode'
import { ToolkitError } from '../../../../shared/errors'
import { LAMBDA_FUNCTION_TYPE, LAMBDA_LAYER_TYPE } from '../../../../shared/cloudformation/cloudformation'
import { ResourceToImport } from '@aws-sdk/client-cloudformation'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'

describe('lambda2samCoreLogic', function () {
    let sandbox: sinon.SinonSandbox
    let tempDir: string
    let lambdaClientStub: sinon.SinonStubbedInstance<DefaultLambdaClient>
    let cfnClientStub: any
    let downloadUnzipStub: sinon.SinonStub

    /**
     * Helper function to verify that files were created in the output directory
     */
    async function verifyFilesCreated(targetDir: vscode.Uri, resourceName: string) {
        const outputDir = vscode.Uri.joinPath(targetDir, resourceName)
        assert.strictEqual(await fs.exists(outputDir), true, `Output directory ${resourceName} should exist`)
        assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'index.js')), true, 'index.js should exist')
        assert.strictEqual(
            await fs.exists(vscode.Uri.joinPath(outputDir, 'package.json')),
            true,
            'package.json should exist'
        )
    }

    /**
     * Helper function to create a standard stack info object for tests
     */
    function createStackInfo() {
        return { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }
    }

    /**
     * Helper function to setup layer version stubs for testing
     */
    function setupLayerVersionStubs() {
        cfnClientStub.describeStackResource.resolves({
            StackResourceDetail: {
                PhysicalResourceId: 'arn:aws:lambda:us-west-2:123456789012:layer:my-layer:1',
            },
        })

        lambdaClientStub.getLayerVersion.resolves({
            Content: { Location: 'https://lambda-layer-code.zip' },
        })
    }

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempDir = await makeTemporaryToolkitFolder()

        // Create Lambda client stub with necessary properties
        lambdaClientStub = sandbox.createStubInstance(DefaultLambdaClient)
        Object.defineProperty(lambdaClientStub, 'defaultTimeoutInMs', {
            value: 5 * 60 * 1000, // 5 minutes
            configurable: true,
        })
        Object.defineProperty(lambdaClientStub, 'createSdkClient', {
            value: () => Promise.resolve({}),
            configurable: true,
        })

        sandbox.stub(utils, 'getLambdaClient').returns(lambdaClientStub as any)

        // Mock CloudFormation client - now returns Promises directly (no .promise() method)
        cfnClientStub = {
            describeStackResource: sandbox.stub().resolves({
                StackResourceDetail: {
                    PhysicalResourceId: 'test-physical-id',
                },
            }),
            describeStackResources: sandbox.stub().resolves({
                StackResources: [
                    { LogicalResourceId: 'testResource', PhysicalResourceId: 'test-physical-id' },
                    { LogicalResourceId: 'prefixTestResource', PhysicalResourceId: 'prefix-test-physical-id' },
                ],
            }),
            describeStacks: sandbox.stub().resolves({
                Stacks: [
                    {
                        StackId: 'stack-id',
                        StackName: 'test-stack',
                        StackStatus: 'CREATE_COMPLETE',
                    },
                ],
            }),
            getTemplate: sandbox.stub().resolves({
                TemplateBody: '{"Resources": {"TestFunc": {"Type": "AWS::Lambda::Function"}}}',
            }),
            getGeneratedTemplate: sandbox.stub().resolves({
                Status: 'COMPLETE',
                TemplateBody:
                    '{"Resources": {"TestFunc": {"Type": "AWS::Lambda::Function", "Properties": {"FunctionName": "test-function"}}}}',
            }),
            describeGeneratedTemplate: sandbox.stub().resolves({
                Status: 'COMPLETE',
                Resources: [
                    {
                        LogicalResourceId: 'TestFunc',
                        ResourceType: 'AWS::Lambda::Function',
                        ResourceIdentifier: {
                            FunctionName: 'arn:aws:lambda:us-east-2:123456789012:function:test-function',
                        },
                    },
                ],
            }),
            createChangeSet: sandbox.stub().resolves({ Id: 'change-set-id' }),
            waitFor: sandbox.stub().resolves(),
            executeChangeSet: sandbox.stub().resolves(),
            describeChangeSet: sandbox.stub().resolves({
                StatusReason: 'Test reason',
            }),
        }
        sandbox.stub(utils, 'getCFNClient').resolves(cfnClientStub)

        // Setup test window to return appropriate values
        getTestWindow().onDidShowMessage((msg) => {
            if (msg.message.includes('Enter Stack Name')) {
                msg.selectItem('test-stack')
            }
        })

        getTestWindow().onDidShowDialog((dialog) => {
            dialog.selectItem(vscode.Uri.file(tempDir))
        })

        // Stub downloadUnzip function
        downloadUnzipStub = sandbox.stub(utils, 'downloadUnzip').callsFake(async (url, outputPath) => {
            // Create a mock file structure for testing purposes
            if (!(await fs.exists(outputPath))) {
                await fs.mkdir(outputPath)
            }

            await fs.writeFile(
                vscode.Uri.joinPath(outputPath, 'index.js'),
                'exports.handler = async (event) => { return "Hello World" };'
            )
            await fs.writeFile(
                vscode.Uri.joinPath(outputPath, 'package.json'),
                JSON.stringify(
                    {
                        name: 'test-lambda',
                        version: '1.0.0',
                        description: 'Test Lambda function',
                    },
                    undefined,
                    2
                )
            )
        })

        // Stub workspace functions
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as any)
        sandbox.stub(vscode.window, 'showTextDocument').resolves()
    })

    afterEach(async function () {
        sandbox.restore()

        // Clean up the temp directory
        if (await fs.exists(vscode.Uri.file(tempDir))) {
            await fs.delete(vscode.Uri.file(tempDir), { recursive: true, force: true })
        }
    })

    describe('getPhysicalIdfromCFNResourceName', function () {
        it('returns the physical ID when an exact match is found', async function () {
            const result = await lambda2sam.getPhysicalIdfromCFNResourceName(
                'testResource',
                'us-west-2',
                'stack-id',
                LAMBDA_FUNCTION_TYPE
            )

            assert.strictEqual(cfnClientStub.describeStackResource.calledOnce, true)
            assert.strictEqual(cfnClientStub.describeStackResource.firstCall.args[0].StackName, 'stack-id')
            assert.strictEqual(cfnClientStub.describeStackResource.firstCall.args[0].LogicalResourceId, 'testResource')
            assert.strictEqual(result, 'test-physical-id')
        })

        it('returns a prefix match when exact match fails', async function () {
            // Make exact match fail
            cfnClientStub.describeStackResource.rejects(new Error('Resource not found'))

            const result = await lambda2sam.getPhysicalIdfromCFNResourceName(
                'prefix',
                'us-west-2',
                'stack-id',
                LAMBDA_LAYER_TYPE
            )

            assert.strictEqual(cfnClientStub.describeStackResources.calledOnce, true)
            assert.strictEqual(cfnClientStub.describeStackResources.firstCall.args[0].StackName, 'stack-id')
            assert.strictEqual(result, 'prefix-test-physical-id')
        })

        it('returns undefined when no match is found', async function () {
            // Make exact match fail
            cfnClientStub.describeStackResource.rejects(new Error('Resource not found'))

            // Return empty resources
            cfnClientStub.describeStackResources.resolves({ StackResources: [] })

            const result = await lambda2sam.getPhysicalIdfromCFNResourceName(
                'nonexistent',
                'us-west-2',
                'stack-id',
                LAMBDA_LAYER_TYPE
            )
            assert.strictEqual(result, undefined)
        })
    })

    describe('downloadLambdaFunctionCode', function () {
        it('uses physical ID from CloudFormation when not provided', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testResource'
            const stackInfo = createStackInfo()

            lambdaClientStub.getFunction.resolves({
                Code: { Location: 'https://lambda-function-code.zip' },
            })

            await lambda2sam.downloadLambdaFunctionCode(resourceName, stackInfo, targetDir, 'us-west-2')

            // Verify CloudFormation was called to get physical ID
            assert.strictEqual(cfnClientStub.describeStackResource.calledOnce, true)

            // Verify Lambda client was called with correct physical ID
            assert.strictEqual(lambdaClientStub.getFunction.calledOnce, true)
            assert.strictEqual(lambdaClientStub.getFunction.firstCall.args[0], 'test-physical-id')

            // Verify downloadUnzip was called with correct parameters
            assert.strictEqual(downloadUnzipStub.calledOnce, true)
            assert.strictEqual(downloadUnzipStub.firstCall.args[0], 'https://lambda-function-code.zip')
            assert.strictEqual(
                downloadUnzipStub.firstCall.args[1].fsPath,
                vscode.Uri.joinPath(targetDir, resourceName).fsPath
            )

            // Verify files were actually created in the temp directory
            await verifyFilesCreated(targetDir, resourceName)
        })

        it('uses provided physical ID when available', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testResource'
            const physicalResourceId = 'provided-physical-id'
            const stackInfo = createStackInfo()

            lambdaClientStub.getFunction.resolves({
                Code: { Location: 'https://lambda-function-code.zip' },
            })

            await lambda2sam.downloadLambdaFunctionCode(
                resourceName,
                stackInfo,
                targetDir,
                'us-west-2',
                physicalResourceId
            )

            // Verify CloudFormation was NOT called to get physical ID
            assert.strictEqual(cfnClientStub.describeStackResource.called, false)

            // Verify Lambda client was called with provided physical ID
            assert.strictEqual(lambdaClientStub.getFunction.calledOnce, true)
            assert.strictEqual(lambdaClientStub.getFunction.firstCall.args[0], physicalResourceId)

            // Verify files were actually created in the temp directory
            await verifyFilesCreated(targetDir, resourceName)
        })

        it('throws an error when code location is missing', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testResource'
            const stackInfo = createStackInfo()

            lambdaClientStub.getFunction.resolves({
                Code: {}, // No Location
            })

            await assert.rejects(
                lambda2sam.downloadLambdaFunctionCode(resourceName, stackInfo, targetDir, 'us-west-2'),
                /Could not determine code location/
            )
        })
    })

    describe('downloadLayerVersionResourceByName', function () {
        it('extracts layer name and version from ARN and downloads content', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testLayer'
            const stackInfo = createStackInfo()

            setupLayerVersionStubs()

            await lambda2sam.downloadLayerVersionResourceByName(resourceName, stackInfo, targetDir, 'us-west-2')

            // Verify Lambda client was called with correct layer name and version
            assert.strictEqual(lambdaClientStub.getLayerVersion.calledOnce, true)
            assert.strictEqual(lambdaClientStub.getLayerVersion.firstCall.args[0], 'my-layer')
            assert.strictEqual(lambdaClientStub.getLayerVersion.firstCall.args[1], 1)

            // Verify downloadUnzip was called with correct parameters
            assert.strictEqual(downloadUnzipStub.calledOnce, true)
            assert.strictEqual(downloadUnzipStub.firstCall.args[0], 'https://lambda-layer-code.zip')
            assert.strictEqual(
                downloadUnzipStub.firstCall.args[1].fsPath,
                vscode.Uri.joinPath(targetDir, resourceName).fsPath
            )

            // Verify files were actually created in the temp directory
            await verifyFilesCreated(targetDir, resourceName)
        })

        it('throws an error when ARN format is invalid', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testLayer'
            const stackInfo = createStackInfo()

            // Return an invalid ARN
            cfnClientStub.describeStackResource.resolves({
                StackResourceDetail: {
                    PhysicalResourceId: 'arn:aws:lambda:us-west-2:123456789012:layer:my-layer', // Missing version
                },
            })

            await assert.rejects(
                lambda2sam.downloadLayerVersionResourceByName(resourceName, stackInfo, targetDir, 'us-west-2'),
                /Invalid layer ARN format/
            )
        })

        it('throws an error when layer content location is missing', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testLayer'
            const stackInfo = createStackInfo()

            // Setup layer version stub with ARN but no content location
            cfnClientStub.describeStackResource.resolves({
                StackResourceDetail: {
                    PhysicalResourceId: 'arn:aws:lambda:us-west-2:123456789012:layer:my-layer:1',
                },
            })
            lambdaClientStub.getLayerVersion.resolves({
                Content: {}, // No Location
            })

            await assert.rejects(
                lambda2sam.downloadLayerVersionResourceByName(resourceName, stackInfo, targetDir, 'us-west-2'),
                /Could not determine code location for layer/
            )
        })
    })

    describe('processLambdaUrlResources', function () {
        it('converts Lambda URL resources to FunctionUrlConfig', async function () {
            // Setup resources with Lambda URL - using 'as any' to bypass strict typing for tests
            const resources: cloudFormation.TemplateResources = {
                TestFunc: {
                    Type: cloudFormation.SERVERLESS_FUNCTION_TYPE,
                    Properties: {
                        FunctionName: 'test-function',
                        PackageType: 'Zip',
                    },
                },
                TestFuncUrl: {
                    Type: cloudFormation.LAMBDA_URL_TYPE,
                    Properties: {
                        TargetFunctionArn: { Ref: 'TestFunc' },
                        AuthType: 'NONE',
                    },
                },
            } as any

            // Call the function
            await lambda2sam.processLambdaUrlResources(resources)

            // Verify URL resource is removed
            assert.strictEqual(resources['TestFuncUrl'], undefined)

            // Verify FunctionUrlConfig added to function resource using non-null assertion
            assert.deepStrictEqual(resources['TestFunc']!.Properties!.FunctionUrlConfig, {
                AuthType: 'NONE',
                Cors: undefined,
                InvokeMode: undefined,
            })
        })
    })

    describe('processLambdaResources', function () {
        const stackInfo = createStackInfo()
        let projectDir: vscode.Uri

        beforeEach(async function () {
            // Add necessary stub for getFunction
            lambdaClientStub.getFunction.resolves({
                Code: { Location: 'https://lambda-function-code.zip' },
            })
            projectDir = vscode.Uri.file(tempDir)
        })

        it('transforms AWS::Lambda::Function to AWS::Serverless::Function', async function () {
            // Setup resources with Lambda function - using 'as any' to bypass strict typing for tests
            const resources: cloudFormation.TemplateResources = {
                TestFunc: {
                    Type: cloudFormation.LAMBDA_FUNCTION_TYPE,
                    Properties: {
                        FunctionName: 'test-function',
                        Handler: 'index.handler',
                        Runtime: 'nodejs18.x',
                        Code: {
                            S3Bucket: 'test-bucket',
                            S3Key: 'test-key',
                        },
                        Tags: [
                            { Key: 'test-key', Value: 'test-value' },
                            { Key: 'lambda:createdBy', Value: 'test' },
                        ],
                        TracingConfig: {
                            Mode: 'Active',
                        },
                        PackageType: 'Zip',
                    },
                },
            } as any

            // Call the function
            await lambda2sam.processLambdaResources(resources, projectDir, stackInfo, 'us-west-2')

            // Verify function type was transformed using non-null assertions
            assert.strictEqual(resources['TestFunc']!.Type, cloudFormation.SERVERLESS_FUNCTION_TYPE)

            // Verify properties were transformed correctly using non-null assertions
            assert.strictEqual(resources['TestFunc']!.Properties!.Code, undefined)
            assert.strictEqual(resources['TestFunc']!.Properties!.CodeUri, 'TestFunc')
            assert.strictEqual(resources['TestFunc']!.Properties!.Tracing, 'Active')
            assert.strictEqual(resources['TestFunc']!.Properties!.TracingConfig, undefined)
            assert.deepStrictEqual(resources['TestFunc']!.Properties!.Tags, {
                'test-key': 'test-value',
            })

            assert.strictEqual(resources['TestFunc']!.Properties!.CodeUri, 'TestFunc')
            // Verify downloadLambdaFunctionCode was called
            assert.strictEqual(downloadUnzipStub.calledOnce, true)
        })

        it('updates CodeUri for AWS::Serverless::Function', async function () {
            // Setup resources with Serverless function - using 'as any' to bypass strict typing for tests
            const resources: cloudFormation.TemplateResources = {
                TestFunc: {
                    Type: cloudFormation.SERVERLESS_FUNCTION_TYPE,
                    Properties: {
                        FunctionName: 'test-function',
                        Handler: 'index.handler',
                        Runtime: 'nodejs18.x',
                        CodeUri: 's3://test-bucket/test-key',
                        PackageType: 'Zip',
                    },
                },
            } as any

            // Call the function
            await lambda2sam.processLambdaResources(resources, projectDir, stackInfo, 'us-west-2')

            // Verify CodeUri was updated using non-null assertions
            assert.strictEqual(resources['TestFunc']!.Properties!.CodeUri, 'TestFunc')

            // Verify downloadLambdaFunctionCode was called
            assert.strictEqual(downloadUnzipStub.calledOnce, true)
        })
    })

    describe('processLambdaLayerResources', function () {
        it('transforms AWS::Lambda::LayerVersion to AWS::Serverless::LayerVersion', async function () {
            // Setup resources with Lambda layer - using 'as any' to bypass strict typing for tests
            const resources: cloudFormation.TemplateResources = {
                TestLayer: {
                    Type: cloudFormation.LAMBDA_LAYER_TYPE,
                    Properties: {
                        LayerName: 'test-layer',
                        Content: {
                            S3Bucket: 'test-bucket',
                            S3Key: 'test-key',
                        },
                        CompatibleRuntimes: ['nodejs18.x'],
                    },
                },
            } as any

            const stackInfo = createStackInfo()
            const projectDir = vscode.Uri.file(tempDir)

            setupLayerVersionStubs()

            // Call the function
            await lambda2sam.processLambdaLayerResources(resources, projectDir, stackInfo, 'us-west-2')

            // Verify layer type was transformed using non-null assertions
            assert.strictEqual(resources['TestLayer']!.Type, cloudFormation.SERVERLESS_LAYER_TYPE)

            // Verify properties were transformed correctly using non-null assertions
            assert.strictEqual(resources['TestLayer']!.Properties!.Content, undefined)
            assert.strictEqual(resources['TestLayer']!.Properties!.ContentUri, 'TestLayer')
            assert.deepStrictEqual(resources['TestLayer']!.Properties!.CompatibleRuntimes, ['nodejs18.x'])

            // Verify downloadLayerVersionResrouceByName was called (through downloadUnzip)
            assert.strictEqual(downloadUnzipStub.calledOnce, true)
        })

        it('preserves AWS::Serverless::LayerVersion properties', async function () {
            // Setup resources with Serverless layer - using 'as any' to bypass strict typing for tests
            const resources: cloudFormation.TemplateResources = {
                TestLayer: {
                    Type: cloudFormation.SERVERLESS_LAYER_TYPE,
                    Properties: {
                        LayerName: 'test-layer',
                        ContentUri: 's3://test-bucket/test-key',
                        CompatibleRuntimes: ['nodejs18.x'],
                    },
                },
            } as any

            const stackInfo = createStackInfo()
            const projectDir = vscode.Uri.file(tempDir)

            setupLayerVersionStubs()

            // Call the function
            await lambda2sam.processLambdaLayerResources(resources, projectDir, stackInfo, 'us-west-2')

            // Verify layer type is still serverless using non-null assertions
            assert.strictEqual(resources['TestLayer']!.Type, cloudFormation.SERVERLESS_LAYER_TYPE)

            // Verify ContentUri was updated using non-null assertions
            assert.strictEqual(resources['TestLayer']!.Properties!.ContentUri, 'TestLayer')

            // Verify downloadLayerVersionResrouceByName was called (through downloadUnzip)
            assert.strictEqual(downloadUnzipStub.calledOnce, true)
        })
    })

    describe('deployCfnTemplate', function () {
        it('deploys a CloudFormation template and returns stack info', async function () {
            // Setup CloudFormation template
            const template: cloudFormation.Template = mockCloudFormationTemplate()

            // Setup Lambda node
            const lambdaNode = mockLambdaNode()

            const resourceToImport: ResourceToImport[] = [
                {
                    ResourceType: LAMBDA_FUNCTION_TYPE,
                    LogicalResourceId: 'TestFunc',
                    ResourceIdentifier: {
                        FunctionName: lambdaNode.name,
                    },
                },
            ]

            // Call the function
            const result = await lambda2sam.deployCfnTemplate(
                template,
                resourceToImport,
                'test-stack',
                lambdaNode.regionCode
            )

            // Verify createChangeSet was called with correct parameters
            assert.strictEqual(cfnClientStub.createChangeSet.called, true)
            const createChangeSetArgs = cfnClientStub.createChangeSet.firstCall.args[0]
            assert.strictEqual(createChangeSetArgs.StackName, 'test-stack')
            assert.strictEqual(createChangeSetArgs.ChangeSetType, 'IMPORT')

            // Verify waitFor and executeChangeSet were called
            assert.strictEqual(cfnClientStub.waitFor.calledWith('changeSetCreateComplete'), true)
            assert.strictEqual(cfnClientStub.executeChangeSet.called, true)

            // Verify describeStacks was called to get stack ID
            assert.strictEqual(cfnClientStub.describeStacks.called, true)

            // Verify result structure
            assert.strictEqual(result.stackId, 'stack-id')
            assert.strictEqual(result.stackName, 'test-stack')
            assert.strictEqual(result.isSamTemplate, false)
            assert.deepStrictEqual(result.template, template)
        })

        it('throws an error when change set creation fails', async function () {
            // Setup CloudFormation template
            const template: cloudFormation.Template = mockCloudFormationTemplate()

            // Setup Lambda node
            const lambdaNode = mockLambdaNode()

            // Make createChangeSet fail
            cfnClientStub.createChangeSet.resolves({}) // No Id

            const resourceToImport: ResourceToImport[] = [
                {
                    ResourceType: LAMBDA_FUNCTION_TYPE,
                    LogicalResourceId: 'TestFunc',
                    ResourceIdentifier: {
                        FunctionName: lambdaNode.name,
                    },
                },
            ]

            // Call the function and expect error
            await assert.rejects(
                lambda2sam.deployCfnTemplate(template, resourceToImport, 'test-stack', lambdaNode.regionCode),
                (err: ToolkitError) => {
                    assert.strictEqual(err.message.includes('Failed to create change set'), true)
                    return true
                }
            )
        })
    })

    describe('callExternalApiForCfnTemplate', function () {
        it('extracts function name from ARN in ResourceIdentifier', async function () {
            // Setup Lambda node
            const lambdaNode = mockLambdaNode(true)

            // Mock IAM connection
            const mockConnection = mockIamConnection()
            sandbox.stub(authUtils, 'getIAMConnection').resolves(mockConnection)

            // Mock fetch response
            const mockFetch = mockFetchResponse(sandbox)

            // Setup CloudFormation client to return ARN in ResourceIdentifier
            cfnClientStub.describeGeneratedTemplate.resolves({
                Status: 'COMPLETE',
                Resources: [
                    {
                        LogicalResourceId: 'TestFunc',
                        ResourceType: 'AWS::Lambda::Function',
                        ResourceIdentifier: {
                            FunctionName: 'arn:aws:lambda:us-east-2:123456789012:function:test-function',
                        },
                    },
                ],
            })

            // Call the function
            const [_, resourcesToImport] = await lambda2sam.callExternalApiForCfnTemplate(lambdaNode)

            // Verify that the ARN was converted to just the function name
            assert.strictEqual(resourcesToImport.length, 1)
            assert.strictEqual(resourcesToImport[0].ResourceType, 'AWS::Lambda::Function')
            assert.strictEqual(resourcesToImport[0].LogicalResourceId, 'TestFunc')
            assert.strictEqual(resourcesToImport[0].ResourceIdentifier!.FunctionName, 'test-function')

            // Verify API calls were made
            assert.strictEqual(mockFetch.calledOnce, true)
            assert.strictEqual(cfnClientStub.getGeneratedTemplate.calledOnce, true)
            assert.strictEqual(cfnClientStub.describeGeneratedTemplate.calledOnce, true)
        })

        it('preserves function name when not an ARN', async function () {
            // Setup Lambda node
            const lambdaNode = mockLambdaNode(true)

            // Mock IAM connection
            const mockConnection = mockIamConnection()
            sandbox.stub(authUtils, 'getIAMConnection').resolves(mockConnection)

            // Mock fetch response
            mockFetchResponse(sandbox)

            // Setup CloudFormation client to return plain function name
            cfnClientStub.describeGeneratedTemplate.resolves({
                Status: 'COMPLETE',
                Resources: [
                    {
                        LogicalResourceId: 'TestFunc',
                        ResourceType: 'AWS::Lambda::Function',
                        ResourceIdentifier: {
                            FunctionName: 'test-function',
                        },
                    },
                ],
            })

            // Call the function
            const [_, resourcesToImport] = await lambda2sam.callExternalApiForCfnTemplate(lambdaNode)

            // Verify that the function name was preserved
            assert.strictEqual(resourcesToImport.length, 1)
            assert.strictEqual(resourcesToImport[0].ResourceIdentifier!.FunctionName, 'test-function')
        })

        it('handles non-Lambda resources without modification', async function () {
            // Setup Lambda node
            const lambdaNode = mockLambdaNode(true)

            // Mock IAM connection
            const mockConnection = mockIamConnection()
            sandbox.stub(authUtils, 'getIAMConnection').resolves(mockConnection)

            // Mock fetch response
            mockFetchResponse(sandbox)

            // Setup CloudFormation client to return mixed resource types
            cfnClientStub.describeGeneratedTemplate.resolves({
                Status: 'COMPLETE',
                Resources: [
                    {
                        LogicalResourceId: 'TestFunc',
                        ResourceType: 'AWS::Lambda::Function',
                        ResourceIdentifier: {
                            FunctionName: 'arn:aws:lambda:us-east-2:123456789012:function:test-function',
                        },
                    },
                    {
                        LogicalResourceId: 'TestRole',
                        ResourceType: 'AWS::IAM::Role',
                        ResourceIdentifier: {
                            RoleName: 'test-role',
                        },
                    },
                ],
            })

            // Call the function
            const [_, resourcesToImport] = await lambda2sam.callExternalApiForCfnTemplate(lambdaNode)

            // Verify that Lambda function ARN was converted but IAM role was not
            assert.strictEqual(resourcesToImport.length, 2)

            const lambdaResource = resourcesToImport.find((r) => r.ResourceType === 'AWS::Lambda::Function')
            const iamResource = resourcesToImport.find((r) => r.ResourceType === 'AWS::IAM::Role')

            assert.strictEqual(lambdaResource!.ResourceIdentifier!.FunctionName, 'test-function')
            assert.strictEqual(iamResource!.ResourceIdentifier!.RoleName, 'test-role')
        })
    })

    describe('lambdaToSam', function () {
        it('converts a Lambda function to a SAM project', async function () {
            // Setup Lambda node
            const lambdaNode = mockLambdaNode()

            // Setup AWS Lambda client responses
            lambdaClientStub.getFunction.resolves({
                Tags: {
                    'aws:cloudformation:stack-id': 'stack-id',
                    'aws:cloudformation:stack-name': 'test-stack',
                },
                Configuration: {
                    FunctionName: 'test-function',
                    Handler: 'index.handler',
                    Runtime: 'nodejs18.x',
                },
                Code: {
                    Location: 'https://lambda-function-code.zip',
                },
            })

            // Setup CloudFormation client responses
            cfnClientStub.describeStacks.resolves({
                Stacks: [
                    {
                        StackId: 'stack-id',
                        StackName: 'test-stack',
                        StackStatus: 'CREATE_COMPLETE',
                    },
                ],
            })

            cfnClientStub.getTemplate.resolves({
                TemplateBody: JSON.stringify({
                    AWSTemplateFormatVersion: '2010-09-09',
                    Transform: 'AWS::Serverless-2016-10-31',
                    Resources: {
                        TestFunc: {
                            Type: 'AWS::Serverless::Function',
                            Properties: {
                                FunctionName: 'test-function',
                                Handler: 'index.handler',
                                Runtime: 'nodejs18.x',
                                CodeUri: 's3://test-bucket/test-key',
                                PackageType: 'Zip',
                            },
                        },
                    },
                }),
            })

            // Setup test window to return a project directory
            getTestWindow().onDidShowDialog((dialog) => {
                dialog.selectItem(vscode.Uri.file(tempDir))
            })
            // Spy on walkthrough.openProjectInWorkspace
            const openProjectStub = sandbox.stub(walkthrough, 'openProjectInWorkspace')

            // Call the function
            await lambda2sam.lambdaToSam(lambdaNode)

            assert.strictEqual(
                await fs.exists(vscode.Uri.joinPath(vscode.Uri.file(tempDir), 'test-stack', 'template.yaml').fsPath),
                true,
                'template.yaml was not written'
            )
            assert.strictEqual(
                await fs.exists(vscode.Uri.joinPath(vscode.Uri.file(tempDir), 'test-stack', 'README.md').fsPath),
                true,
                'README.md was not written'
            )
            assert.strictEqual(
                await fs.exists(vscode.Uri.joinPath(vscode.Uri.file(tempDir), 'test-stack', 'samconfig.toml').fsPath),
                true,
                'samconfig.toml was not written'
            )

            // Verify that project was opened in workspace
            assert.strictEqual(openProjectStub.calledOnce, true)
            assert.strictEqual(
                openProjectStub.firstCall.args[0].fsPath,
                vscode.Uri.joinPath(vscode.Uri.file(tempDir), 'test-stack').fsPath
            )
        })
    })

    function mockLambdaNode(withArn: boolean = false) {
        if (withArn) {
            return {
                name: 'test-function',
                regionCode: 'us-east-2',
                arn: 'arn:aws:lambda:us-east-2:123456789012:function:test-function',
            } as LambdaFunctionNode
        } else {
            return {
                name: 'test-function',
                regionCode: 'us-east-2',
            } as LambdaFunctionNode
        }
    }

    function mockIamConnection() {
        return {
            type: 'iam' as const,
            id: 'test-connection',
            label: 'Test Connection',
            state: 'valid' as const,
            getCredentials: sandbox.stub().resolves({
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            }),
            endpointUrl: undefined,
        }
    }

    function mockCloudFormationTemplate(): cloudFormation.Template {
        return {
            AWSTemplateFormatVersion: '2010-09-09',
            Resources: {
                TestFunc: {
                    Type: cloudFormation.LAMBDA_FUNCTION_TYPE,
                    Properties: {
                        FunctionName: 'test-function',
                        PackageType: 'Zip',
                        Handler: 'index.handler',
                        CodeUri: 's3://test-bucket/test-key',
                    },
                },
            },
        }
    }

    function mockFetchResponse(sandbox: sinon.SinonSandbox) {
        return sandbox.stub(global, 'fetch').resolves({
            ok: true,
            json: sandbox.stub().resolves({
                cloudFormationTemplateId: 'test-template-id',
            }),
        } as any)
    }
})
