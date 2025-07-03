/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { getTestWindow } from '../../shared/vscode/window'

import fs from '../../../shared/fs/fs'
import { ResourceNode } from '../../../awsService/appBuilder/explorer/nodes/resourceNode'
import path from 'path'
import { SERVERLESS_FUNCTION_TYPE } from '../../../shared/cloudformation/cloudformation'
import {
    runOpenHandler,
    runOpenTemplate,
    isPermissionError,
    EnhancedLambdaClient,
    EnhancedCloudFormationClient,
    getLambdaClient,
    getCFNClient,
} from '../../../awsService/appBuilder/utils'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { assertTextEditorContains } from '../../testUtil'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'
import { ToolkitError } from '../../../shared/errors'
import globals from '../../../shared/extensionGlobals'

interface TestScenario {
    runtime: string
    handler: string
    codeUri: string
    fileLocation: string
    fileInfo: string
    regex: RegExp
}

const scenarios: TestScenario[] = [
    {
        runtime: 'java21',
        handler: 'resizer.App::handleRequest',
        codeUri: 'ResizerFunction',
        fileLocation: 'ResizerFunction/src/main/java/resizer/App.java',
        fileInfo: 'testjava',
        regex: /App.java/g,
    },
    {
        runtime: 'dotnet6',
        handler: 'ImageResize::ImageResize.Function::FunctionHandler',
        codeUri: 'ImageResize/',
        fileLocation: 'ImageResize/Function.cs',
        fileInfo: 'testdotnet',
        regex: /Function.cs/g,
    },
    {
        runtime: 'python3.9',
        handler: 'app.lambda_handler',
        codeUri: 'hello_world/',
        fileLocation: 'hello_world/app.py',
        fileInfo: 'testpython',
        regex: /app.py/g,
    },
    {
        runtime: 'nodejs18.x',
        handler: 'app.handler',
        codeUri: 'src/',
        fileLocation: 'src/app.js',
        fileInfo: 'testnode',
        regex: /app.js/g,
    },
    {
        runtime: 'ruby3.2',
        handler: 'app.lambda_handler',
        codeUri: 'hello_world/',
        fileLocation: 'hello_world/app.rb',
        fileInfo: 'testruby',
        regex: /app.rb/g,
    },
    {
        runtime: 'java21',
        handler: 'resizer.App::handleRequest',
        codeUri: 'ResizerFunction',
        fileLocation: 'ResizerFunction/src/foo/bar/main/java/resizer/App.java',
        fileInfo: 'testjava2',
        regex: /App.java/g,
    },
    {
        runtime: 'dotnet8',
        handler: 'ImageResize::ImageResize.Function::FunctionHandler',
        codeUri: 'ImageResize/src/test',
        fileLocation: 'ImageResize/src/test/Function.cs',
        fileInfo: 'testdotnet2',
        regex: /Function.cs/g,
    },
    {
        runtime: 'python3.12',
        handler: 'app.foo.bar.lambda_handler',
        codeUri: 'hello_world/test123',
        fileLocation: 'hello_world/test123/app/foo/bar.py',
        fileInfo: 'testpython2',
        regex: /bar.py/g,
    },
    {
        runtime: 'nodejs20.x',
        handler: 'app.foo.bar.handler',
        codeUri: 'src/test123',
        fileLocation: 'src/test123/app/foo/bar.js',
        fileInfo: 'testnode2',
        regex: /bar.js/g,
    },
    {
        runtime: 'ruby3.3',
        handler: 'app/foo/bar.lambda_handler',
        codeUri: 'hello_world/test456',
        fileLocation: 'hello_world/test456/app/foo/bar.rb',
        fileInfo: 'testruby2',
        regex: /bar.rb/g,
    },
]

describe('AppBuilder Utils', function () {
    describe('openHandler', function () {
        let sandbox: sinon.SinonSandbox
        const workspace = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspace)
        const tempFolder = path.join(workspace.uri.fsPath, 'temp')

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            await fs.mkdir(tempFolder)
        })

        afterEach(async function () {
            await fs.delete(tempFolder, { recursive: true })
            sandbox.restore()
        })

        for (const scenario of scenarios) {
            it(`should open ${scenario.runtime}`, async function () {
                // Given
                const rNode = new ResourceNode(
                    {
                        samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'template.yaml')),
                        workspaceFolder: workspace,
                        projectRoot: vscode.Uri.file(tempFolder),
                    },
                    {
                        Id: 'MyFunction',
                        Type: SERVERLESS_FUNCTION_TYPE,
                        Runtime: scenario.runtime,
                        Handler: scenario.handler,
                        CodeUri: scenario.codeUri,
                    }
                )
                await fs.mkdir(path.join(tempFolder, ...path.dirname(scenario.fileLocation).split('/')))
                await fs.writeFile(path.join(tempFolder, ...scenario.fileLocation.split('/')), scenario.fileInfo)
                await runOpenHandler(rNode)
                // Then
                assert.strictEqual(
                    vscode.window.activeTextEditor?.document.fileName,
                    path.join(tempFolder, ...scenario.fileLocation.split('/'))
                )
                await assertTextEditorContains(scenario.fileInfo)
            })
        }
    })

    describe('openHandler', function () {
        let sandbox: sinon.SinonSandbox
        const workspace = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspace)
        const tempFolder = path.join(workspace.uri.fsPath, 'temp')

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            await fs.mkdir(tempFolder)
        })

        afterEach(async function () {
            await fs.delete(tempFolder, { recursive: true })
            sandbox.restore()
        })

        for (const scenario of scenarios) {
            it(`should open ${scenario.runtime}`, async function () {
                // Given
                const rNode = new ResourceNode(
                    {
                        samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'template.yaml')),
                        workspaceFolder: workspace,
                        projectRoot: vscode.Uri.file(tempFolder),
                    },
                    {
                        Id: 'MyFunction',
                        Type: SERVERLESS_FUNCTION_TYPE,
                        Runtime: scenario.runtime,
                        Handler: scenario.handler,
                        CodeUri: scenario.codeUri,
                    }
                )
                await fs.mkdir(path.join(tempFolder, ...path.dirname(scenario.fileLocation).split('/')))
                await fs.writeFile(path.join(tempFolder, ...scenario.fileLocation.split('/')), scenario.fileInfo)
                await runOpenHandler(rNode)
                // Then
                assert.strictEqual(
                    vscode.window.activeTextEditor?.document.fileName,
                    path.join(tempFolder, ...scenario.fileLocation.split('/'))
                )
                await assertTextEditorContains(scenario.fileInfo)
            })
        }

        it(`should warn for multiple java handler found`, async function () {
            const rNode = new ResourceNode(
                {
                    samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'template.yaml')),
                    workspaceFolder: workspace,
                    projectRoot: vscode.Uri.file(tempFolder),
                },
                {
                    Id: 'MyFunction',
                    Type: SERVERLESS_FUNCTION_TYPE,
                    Runtime: 'java21',
                    Handler: 'resizer.App::handleRequest',
                    CodeUri: 'ResizerFunction',
                }
            )
            // When 2 java handler with right name under code URI
            await fs.mkdir(
                path.join(tempFolder, ...path.dirname('ResizerFunction/src/main/java/resizer/App.java').split('/'))
            )
            await fs.writeFile(
                path.join(tempFolder, ...'ResizerFunction/src/main/java/resizer/App.java'.split('/')),
                'testjava'
            )
            await fs.mkdir(
                path.join(tempFolder, ...path.dirname('ResizerFunction/src/main/java/resizer2/App.java').split('/'))
            )
            await fs.writeFile(
                path.join(tempFolder, ...'ResizerFunction/src/main/java/resizer2/App.java'.split('/')),
                'testjava'
            )
            // Then should warn
            getTestWindow().onDidShowMessage((msg) =>
                assert(msg.assertWarn('Multiple handler files found with name App.java"'))
            )
            await runOpenHandler(rNode)
        })
    })

    describe('open template', function () {
        let sandbox: sinon.SinonSandbox
        const workspace = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspace)
        const tempFolder = path.join(workspace.uri.fsPath, 'temp')

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            await fs.mkdir(tempFolder)
        })

        afterEach(async function () {
            await fs.delete(tempFolder, { recursive: true })
            sandbox.restore()
        })

        it('select template should succeed', async function () {
            const tNode = {
                id: 'MyFunction',
                resource: {
                    // this doesn't exist
                    samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'abc', 'template.yaml')),
                    workspaceFolder: workspace,
                    projectRoot: vscode.Uri.file(tempFolder),
                },
            }
            getTestWindow().onDidShowQuickPick((picker) => {
                picker.acceptItem(picker.items[0])
            })
            await fs.mkdir(path.join(tempFolder, 'abc'))
            await fs.writeFile(path.join(tempFolder, 'abc', 'template.yaml'), 'testyaml')

            await vscode.commands.executeCommand('aws.appBuilder.openTemplate', tNode)
            // Then
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.fileName,
                path.join(tempFolder, 'abc', 'template.yaml')
            )
            await assertTextEditorContains('testyaml')
        })

        it('should raise if no template', async function () {
            // Given
            const openCommand = sandbox.spy(vscode.workspace, 'openTextDocument')
            const showCommand = sandbox.spy(vscode.window, 'showTextDocument')
            const tNode = {
                id: 'MyFunction',
                resource: {
                    // this doesn't exist
                    samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'template.yaml')),
                    workspaceFolder: workspace,
                    projectRoot: vscode.Uri.file(tempFolder),
                },
            }
            try {
                await runOpenTemplate(tNode as TreeNode)
                assert.fail('SAM Template not found, cannot open template')
            } catch (err) {
                assert.strictEqual((err as Error).message, 'SAM Template not found, cannot open template')
            }
            // Then
            assert(openCommand.neverCalledWith(sinon.match.has('fspath', sinon.match(/template.yaml/g))))
            assert(showCommand.notCalled)
        })
    })

    describe('Permission Error Handling', function () {
        let sandbox: sinon.SinonSandbox

        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        describe('isPermissionError', function () {
            it('should return true for AccessDeniedException', function () {
                const error = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                assert.strictEqual(isPermissionError(error), true)
            })

            it('should return true for UnauthorizedOperation', function () {
                const error = Object.assign(new Error('Unauthorized'), {
                    code: 'UnauthorizedOperation',
                    time: new Date(),
                    statusCode: 403,
                })
                assert.strictEqual(isPermissionError(error), true)
            })

            it('should return true for Forbidden', function () {
                const error = Object.assign(new Error('Forbidden'), {
                    code: 'Forbidden',
                    time: new Date(),
                    statusCode: 403,
                })
                assert.strictEqual(isPermissionError(error), true)
            })

            it('should return true for AccessDenied', function () {
                const error = Object.assign(new Error('Access denied'), {
                    code: 'AccessDenied',
                    time: new Date(),
                    statusCode: 403,
                })
                assert.strictEqual(isPermissionError(error), true)
            })

            it('should return true for 403 status code', function () {
                const error = Object.assign(new Error('Forbidden'), {
                    code: 'SomeError',
                    statusCode: 403,
                    time: new Date(),
                })
                assert.strictEqual(isPermissionError(error), true)
            })

            it('should return false for non-permission errors', function () {
                const error = Object.assign(new Error('Resource not found'), {
                    code: 'ResourceNotFoundException',
                    time: new Date(),
                    statusCode: 404,
                })
                assert.strictEqual(isPermissionError(error), false)
            })

            it('should return false for non-AWS errors', function () {
                const error = new Error('Regular error')
                assert.strictEqual(isPermissionError(error), false)
            })

            it('should return false for undefined', function () {
                assert.strictEqual(isPermissionError(undefined), false)
            })
        })

        describe('EnhancedLambdaClient', function () {
            let mockLambdaClient: sinon.SinonStubbedInstance<DefaultLambdaClient>
            let enhancedClient: EnhancedLambdaClient

            beforeEach(function () {
                mockLambdaClient = sandbox.createStubInstance(DefaultLambdaClient)
                // Add missing properties that EnhancedLambdaClient expects
                Object.defineProperty(mockLambdaClient, 'defaultTimeoutInMs', {
                    value: 5 * 60 * 1000,
                    configurable: true,
                })
                Object.defineProperty(mockLambdaClient, 'createSdkClient', {
                    value: sandbox.stub().resolves({}),
                    configurable: true,
                })
                enhancedClient = new EnhancedLambdaClient(mockLambdaClient as any, 'us-east-1')
            })

            it('should enhance permission errors for getFunction', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockLambdaClient.getFunction.rejects(permissionError)

                try {
                    await enhancedClient.getFunction('test-function')
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes('Permission denied: Missing required permissions for lambda:getFunction')
                    )
                    assert(error.message.includes('lambda:GetFunction'))
                    assert(error.message.includes('arn:aws:lambda:us-east-1:*:function:test-function'))
                    assert(error.message.includes('To fix this issue:'))
                    assert(error.message.includes('Documentation:'))
                }
            })

            it('should pass through non-permission errors for getFunction', async function () {
                const nonPermissionError = new Error('Function not found')
                mockLambdaClient.getFunction.rejects(nonPermissionError)

                try {
                    await enhancedClient.getFunction('test-function')
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert.strictEqual(error, nonPermissionError)
                }
            })

            it('should enhance permission errors for listFunctions', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })

                // Create a mock async generator that throws the error
                const mockAsyncGenerator = async function* (): AsyncIterableIterator<any> {
                    throw permissionError
                    yield // This line will never be reached but satisfies ESLint require-yield rule
                }
                mockLambdaClient.listFunctions.returns(mockAsyncGenerator())

                try {
                    const iterator = enhancedClient.listFunctions()
                    await iterator.next()
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for lambda:listFunctions'
                        )
                    )
                    assert(error.message.includes('lambda:ListFunctions'))
                }
            })

            it('should enhance permission errors for deleteFunction', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockLambdaClient.deleteFunction.rejects(permissionError)

                try {
                    await enhancedClient.deleteFunction('test-function')
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for lambda:deleteFunction'
                        )
                    )
                    assert(error.message.includes('lambda:DeleteFunction'))
                    assert(error.message.includes('arn:aws:lambda:us-east-1:*:function:test-function'))
                }
            })

            it('should enhance permission errors for invoke', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockLambdaClient.invoke.rejects(permissionError)

                try {
                    await enhancedClient.invoke('test-function', '{}')
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(error.message.includes('Permission denied: Missing required permissions for lambda:invoke'))
                    assert(error.message.includes('lambda:InvokeFunction'))
                    assert(error.message.includes('arn:aws:lambda:us-east-1:*:function:test-function'))
                }
            })

            it('should enhance permission errors for getLayerVersion', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockLambdaClient.getLayerVersion.rejects(permissionError)

                try {
                    await enhancedClient.getLayerVersion('test-layer', 1)
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for lambda:getLayerVersion'
                        )
                    )
                    assert(error.message.includes('lambda:GetLayerVersion'))
                    assert(error.message.includes('arn:aws:lambda:us-east-1:*:layer:test-layer:1'))
                }
            })

            it('should enhance permission errors for updateFunctionCode', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockLambdaClient.updateFunctionCode.rejects(permissionError)

                try {
                    await enhancedClient.updateFunctionCode('test-function', new Uint8Array())
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for lambda:updateFunctionCode'
                        )
                    )
                    assert(error.message.includes('lambda:UpdateFunctionCode'))
                    assert(error.message.includes('arn:aws:lambda:us-east-1:*:function:test-function'))
                }
            })

            it('should return successful results when no errors occur', async function () {
                const mockResponse = { Configuration: { FunctionName: 'test-function' } }
                mockLambdaClient.getFunction.resolves(mockResponse)

                const result = await enhancedClient.getFunction('test-function')
                assert.strictEqual(result, mockResponse)
            })
        })

        describe('EnhancedCloudFormationClient', function () {
            let mockCfnClient: any
            let enhancedClient: EnhancedCloudFormationClient

            beforeEach(function () {
                // Create a mock CloudFormation client with all required methods
                mockCfnClient = {
                    describeStacks: sandbox.stub(),
                    getTemplate: sandbox.stub(),
                    createChangeSet: sandbox.stub(),
                    describeStackResource: sandbox.stub(),
                    describeStackResources: sandbox.stub(),
                }
                enhancedClient = new EnhancedCloudFormationClient(mockCfnClient, 'us-east-1')
            })

            it('should enhance permission errors for describeStacks', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockCfnClient.describeStacks.returns({
                    promise: sandbox.stub().rejects(permissionError),
                } as any)

                try {
                    await enhancedClient.describeStacks({ StackName: 'test-stack' })
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for cloudformation:describeStacks'
                        )
                    )
                    assert(error.message.includes('cloudformation:DescribeStacks'))
                    assert(error.message.includes('arn:aws:cloudformation:us-east-1:*:stack/test-stack/*'))
                    assert(error.message.includes('To fix this issue:'))
                    assert(error.message.includes('Documentation:'))
                }
            })

            it('should enhance permission errors for getTemplate', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockCfnClient.getTemplate.returns({
                    promise: sandbox.stub().rejects(permissionError),
                } as any)

                try {
                    await enhancedClient.getTemplate({ StackName: 'test-stack' })
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for cloudformation:getTemplate'
                        )
                    )
                    assert(error.message.includes('cloudformation:GetTemplate'))
                    assert(error.message.includes('arn:aws:cloudformation:us-east-1:*:stack/test-stack/*'))
                }
            })

            it('should enhance permission errors for createChangeSet', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockCfnClient.createChangeSet.returns({
                    promise: sandbox.stub().rejects(permissionError),
                } as any)

                try {
                    await enhancedClient.createChangeSet({
                        StackName: 'test-stack',
                        ChangeSetName: 'test-changeset',
                        TemplateBody: '{}',
                    })
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for cloudformation:createChangeSet'
                        )
                    )
                    assert(error.message.includes('cloudformation:CreateChangeSet'))
                    assert(error.message.includes('arn:aws:cloudformation:us-east-1:*:stack/test-stack/*'))
                }
            })

            it('should enhance permission errors for describeStackResource', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockCfnClient.describeStackResource.returns({
                    promise: sandbox.stub().rejects(permissionError),
                } as any)

                try {
                    await enhancedClient.describeStackResource({
                        StackName: 'test-stack',
                        LogicalResourceId: 'TestResource',
                    })
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for cloudformation:describeStackResource'
                        )
                    )
                    assert(error.message.includes('cloudformation:DescribeStackResource'))
                    assert(error.message.includes('arn:aws:cloudformation:us-east-1:*:stack/test-stack/*'))
                }
            })

            it('should enhance permission errors for describeStackResources', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockCfnClient.describeStackResources.returns({
                    promise: sandbox.stub().rejects(permissionError),
                } as any)

                try {
                    await enhancedClient.describeStackResources({ StackName: 'test-stack' })
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)
                    assert(
                        error.message.includes(
                            'Permission denied: Missing required permissions for cloudformation:describeStackResources'
                        )
                    )
                    assert(error.message.includes('cloudformation:DescribeStackResources'))
                    assert(error.message.includes('arn:aws:cloudformation:us-east-1:*:stack/test-stack/*'))
                }
            })

            it('should pass through non-permission errors', async function () {
                const nonPermissionError = new Error('Stack not found')
                mockCfnClient.describeStacks.returns({
                    promise: sandbox.stub().rejects(nonPermissionError),
                } as any)

                try {
                    await enhancedClient.describeStacks({ StackName: 'test-stack' })
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert.strictEqual(error, nonPermissionError)
                }
            })

            it('should return successful results when no errors occur', async function () {
                const mockResponse = { Stacks: [{ StackName: 'test-stack' }] }
                mockCfnClient.describeStacks.returns({
                    promise: sandbox.stub().resolves(mockResponse),
                } as any)

                const result = await enhancedClient.describeStacks({ StackName: 'test-stack' })
                assert.strictEqual(result, mockResponse)
            })
        })

        describe('Client Factory Functions', function () {
            beforeEach(function () {
                // Stub the global SDK client builder
                sandbox.stub(globals.sdkClientBuilder, 'createAwsService').resolves({} as any)
            })

            it('should return EnhancedLambdaClient from getLambdaClient', function () {
                const client = getLambdaClient('us-east-1')
                assert(client instanceof EnhancedLambdaClient)
            })

            it('should return EnhancedCloudFormationClient from getCFNClient', async function () {
                const client = await getCFNClient('us-east-1')
                assert(client instanceof EnhancedCloudFormationClient)
            })
        })

        describe('Error Message Content', function () {
            let mockLambdaClient: sinon.SinonStubbedInstance<DefaultLambdaClient>
            let enhancedClient: EnhancedLambdaClient

            beforeEach(function () {
                mockLambdaClient = sandbox.createStubInstance(DefaultLambdaClient)
                // Add missing properties that EnhancedLambdaClient expects
                Object.defineProperty(mockLambdaClient, 'defaultTimeoutInMs', {
                    value: 5 * 60 * 1000,
                    configurable: true,
                })
                Object.defineProperty(mockLambdaClient, 'createSdkClient', {
                    value: sandbox.stub().resolves({}),
                    configurable: true,
                })
                enhancedClient = new EnhancedLambdaClient(mockLambdaClient as any, 'us-west-2')
            })

            it('should include all required elements in enhanced error message', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })
                mockLambdaClient.getFunction.rejects(permissionError)

                try {
                    await enhancedClient.getFunction('my-test-function')
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)

                    // Check that the error message contains all expected elements
                    const message = error.message

                    // Main error description
                    assert(message.includes('Permission denied: Missing required permissions for lambda:getFunction'))

                    // Required permissions section
                    assert(message.includes('Required permissions:'))
                    assert(message.includes('- lambda:GetFunction'))

                    // Resource ARN
                    assert(message.includes('Resource: arn:aws:lambda:us-west-2:*:function:my-test-function'))

                    // Instructions
                    assert(message.includes('To fix this issue:'))
                    assert(message.includes('1. Contact your AWS administrator'))
                    assert(message.includes('2. Add these permissions to your IAM user/role policy'))
                    assert(message.includes('3. If using IAM roles, ensure the role has these permissions attached'))

                    // Documentation link
                    assert(
                        message.includes(
                            'Documentation: https://docs.aws.amazon.com/lambda/latest/api/API_GetFunction.html'
                        )
                    )

                    // Check error details
                    assert.strictEqual(error.code, 'InsufficientPermissions')
                    assert(error.details)
                    assert.strictEqual(error.details.service, 'lambda')
                    assert.strictEqual(error.details.action, 'getFunction')
                    assert.deepStrictEqual(error.details.requiredPermissions, ['lambda:GetFunction'])
                    assert.strictEqual(
                        error.details.resourceArn,
                        'arn:aws:lambda:us-west-2:*:function:my-test-function'
                    )
                }
            })

            it('should handle errors without resource ARN', async function () {
                const permissionError = Object.assign(new Error('Access denied'), {
                    code: 'AccessDeniedException',
                    time: new Date(),
                    statusCode: 403,
                })

                // Create a mock async generator that throws the error
                const mockAsyncGenerator = async function* (): AsyncIterableIterator<any> {
                    throw permissionError
                    yield // This line will never be reached but satisfies ESLint require-yield rule
                }
                mockLambdaClient.listFunctions.returns(mockAsyncGenerator())

                try {
                    const iterator = enhancedClient.listFunctions()
                    await iterator.next()
                    assert.fail('Expected error to be thrown')
                } catch (error) {
                    assert(error instanceof ToolkitError)

                    const message = error.message
                    assert(message.includes('Permission denied: Missing required permissions for lambda:listFunctions'))
                    assert(message.includes('- lambda:ListFunctions'))
                    // Should not include Resource line for operations without specific resources
                    assert(!message.includes('Resource: arn:'))
                }
            })
        })
    })
})
