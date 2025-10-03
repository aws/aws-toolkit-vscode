/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import * as vscode from 'vscode'
import * as lambda2sam from '../../../../awsService/appBuilder/lambda2sam/lambda2sam'
import * as utils from '../../../../awsService/appBuilder/utils'
import { fs } from '../../../../shared'
import { DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import os from 'os'
import path from 'path'
import { LAMBDA_FUNCTION_TYPE, LAMBDA_LAYER_TYPE } from '../../../../shared/cloudformation/cloudformation'

describe('lambda2samDownload', function () {
    let sandbox: sinon.SinonSandbox
    let tempDir: string
    let lambdaClientStub: sinon.SinonStubbedInstance<DefaultLambdaClient>
    let cfnClientStub: any
    let downloadUnzipStub: sinon.SinonStub

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempDir = path.join(os.tmpdir(), `aws-toolkit-test-${Date.now()}`)

        // Create temp directory for tests - actually create it, don't stub
        if (!(await fs.exists(vscode.Uri.file(tempDir)))) {
            await fs.mkdir(vscode.Uri.file(tempDir))
        }

        // Create Lambda client stub with necessary properties
        lambdaClientStub = sandbox.createStubInstance(DefaultLambdaClient)
        // Add required properties that aren't stubbed automatically
        Object.defineProperty(lambdaClientStub, 'defaultTimeoutInMs', {
            value: 5 * 60 * 1000, // 5 minutes
            configurable: true,
        })
        Object.defineProperty(lambdaClientStub, 'createSdkClient', {
            value: () => Promise.resolve({}),
            configurable: true,
        })

        sandbox.stub(utils, 'getLambdaClient').returns(lambdaClientStub as any)

        // Stub CloudFormation client - now returns Promises directly (no .promise() method)
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
        }
        sandbox.stub(utils, 'getCFNClient').resolves(cfnClientStub)

        // Stub downloadUnzip function to create actual files in the temp directory
        downloadUnzipStub = sandbox.stub(utils, 'downloadUnzip').callsFake(async (url, outputPath) => {
            // Create a mock file structure for testing purposes

            // Create the output directory if it doesn't exist
            if (!(await fs.exists(outputPath))) {
                await fs.mkdir(outputPath)
            }

            // Create a simple file to simulate extracted content
            await fs.writeFile(
                vscode.Uri.joinPath(outputPath, 'index.js'),
                'exports.handler = async (event) => { return "Hello World" };'
            )

            // Create a package.json file
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
    })

    afterEach(async function () {
        sandbox.restore()

        // Clean up the temp directory after each test
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
            const stackInfo = { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }

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
            const outputDir = vscode.Uri.joinPath(targetDir, resourceName)
            assert.strictEqual(await fs.exists(outputDir), true)
            assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'index.js')), true)
            assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'package.json')), true)
        })

        it('uses provided physical ID when available', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testResource'
            const physicalResourceId = 'provided-physical-id'
            const stackInfo = { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }

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
            const outputDir = vscode.Uri.joinPath(targetDir, resourceName)
            assert.strictEqual(await fs.exists(outputDir), true)
            assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'index.js')), true)
            assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'package.json')), true)
        })

        it('throws an error when code location is missing', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testResource'
            const stackInfo = { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }

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
            const stackInfo = { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }

            // Return an ARN for a layer version
            cfnClientStub.describeStackResource.resolves({
                StackResourceDetail: {
                    PhysicalResourceId: 'arn:aws:lambda:us-west-2:123456789012:layer:my-layer:1',
                },
            })

            lambdaClientStub.getLayerVersion.resolves({
                Content: { Location: 'https://lambda-layer-code.zip' },
            })

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
            const outputDir = vscode.Uri.joinPath(targetDir, resourceName)
            assert.strictEqual(await fs.exists(outputDir), true)
            assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'index.js')), true)
            assert.strictEqual(await fs.exists(vscode.Uri.joinPath(outputDir, 'package.json')), true)
        })

        it('throws an error when ARN format is invalid', async function () {
            const targetDir = vscode.Uri.file(tempDir)
            const resourceName = 'testLayer'
            const stackInfo = { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }

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
            const stackInfo = { stackId: 'stack-id', stackName: 'test-stack', isSamTemplate: false, template: {} }

            // Return an ARN for a layer version
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
})
