/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import {
    getProjectRootUri,
    getProjectRoot,
    getSource,
    isDotnetRuntime,
    getSamCliPathAndVersion,
    getRecentResponse,
    updateRecentResponse,
    getSamCliErrorMessage,
    throwIfErrorMatches,
} from '../../../shared/sam/utils'

import { RegionNode } from '../../../awsexplorer/regionNode'
import { Region } from '../../../shared/regions/endpoints'
import { RegionProvider, ToolkitError } from '../../../shared'
import { DeployedResource, DeployedResourceNode } from '../../../awsService/appBuilder/explorer/nodes/deployedNode'
import { TemplateItem } from '../../../shared/ui/sam/templatePrompter'
import { SamCliInfoInvocation } from '../../../shared/sam/cli/samCliInfo'
import { SamCliSettings } from '../../../shared/sam/cli/samCliSettings'
import { telemetry } from '../../../shared/telemetry'
import globals from '../../../shared/extensionGlobals'
import { assertLogsContain } from '../../globalSetup.test'
import { ChildProcessResult } from '../../../shared/utilities/processUtils'

describe('SAM utils', async function () {
    it('returns the projectRoot', async function () {
        const templateItem: TemplateItem = {
            uri: vscode.Uri.file('file://mock/path/project/file'),
            data: {},
        }
        const response = getProjectRoot(templateItem)
        assert.deepStrictEqual(response, vscode.Uri.file('file://mock/path/project'))
    })
    it('returns the projectRootUri', async function () {
        const template: vscode.Uri = vscode.Uri.file('file://mock/path/project/uri')
        const response = getProjectRootUri(template)
        assert.deepStrictEqual(response, vscode.Uri.file('file://mock/path/project'))
    })

    describe('getSource', async function () {
        const testScenarios = [
            {
                name: 'vscode.Uri',
                value: vscode.Uri.file('file://file'),
                expected: 'template',
            },
            {
                name: 'AWSTreeNode',
                value: new RegionNode({ name: 'us-east-1', id: 'IAD' } as Region, {} as RegionProvider),
                expected: 'regionNode',
            },
            {
                name: 'TreeNode',
                value: new DeployedResourceNode({ arn: 'aws:arn:...', contextValue: '' } as DeployedResource),
                expected: 'appBuilderDeploy',
            },
            {
                name: 'undefined',
                value: undefined,
                expected: undefined,
            },
        ]
        testScenarios.forEach((scenario) => {
            it(`returns Source for ${scenario.name}`, async () => {
                assert.strictEqual(getSource(scenario.value), scenario.expected)
            })
        })
    })

    describe('checks if it is DotNet', async function () {
        let sandbox: sinon.SinonSandbox
        const noUri = vscode.Uri.parse('untitled://')
        const testScenarios = [
            {
                name: 'DotNet function',
                template: `
                    Transform: 'AWS::Serverless-2016-10-31'
                    Resources:
                        Func1:
                            Type: 'AWS::Serverless::Function'
                            Properties:
                                Runtime: 'dotnet8'
                `,
                expected: true,
            },
            {
                name: 'Global DotNet property',
                template: `
                    Transform: 'AWS::Serverless-2016-10-31'
                    Globals:
                        Function:
                            Runtime: 'dotnet8'
                    Resources:
                        Func1:
                            Type: 'AWS::Serverless::Function'
                            Properties: {}
                `,
                expected: true,
            },
            {
                name: 'different runtime',
                template: `
                    Transform: 'AWS::Serverless-2016-10-31'
                    Resources:
                        Func1:
                            Type: 'AWS::Serverless::Function'
                            Properties:
                                Runtime: 'nodejs20.x'
                `,
                expected: false,
            },
            {
                name: 'two functions, one DotNet',
                template: `
                    Transform: 'AWS::Serverless-2016-10-31'
                    Resources:
                        Func1:
                            Type: 'AWS::Serverless::Function'
                            Properties:
                                Runtime: 'nodejs20.x'
                        Func2:
                            Type: 'AWS::Serverless::Function'
                            Properties:
                                Runtime: 'dotnet8'
                `,
                expected: true,
            },
            {
                name: 'no function',
                template: `
                    Transform: 'AWS::Serverless-2016-10-31'
                    Resources:
                        Func1:
                            Type: 'AWS::S3::Bucket'
                            Properties:
                                Runtime: 'nodejs20.x'
                `,
                expected: false,
            },
            {
                name: 'no resources',
                template: ``,
                expected: false,
            },
        ]

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })
        afterEach(() => {
            sandbox.restore()
        })

        testScenarios.forEach((scenario) => {
            it(`returns isDotNetRuntime for ${scenario.name}`, async () => {
                const response = await isDotnetRuntime(noUri, scenario.template)
                assert.strictEqual(response, scenario.expected)
            })
        })
    })

    describe('getSamCliPathAndVersion', async function () {
        let sandbox: sinon.SinonSandbox
        let getOrDetectSamCliStub: sinon.SinonStub
        let executeStub: sinon.SinonStub
        let telemetryStub: sinon.SinonStub

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            getOrDetectSamCliStub = sandbox.stub(SamCliSettings.instance, 'getOrDetectSamCli')
            executeStub = sandbox.stub(SamCliInfoInvocation.prototype, 'execute')
            telemetryStub = sandbox.stub(telemetry, 'record')
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('returns path and version when SAM CLI is found and version is valid', async () => {
            const expectedPath = '/usr/local/bin/sam'
            const expectedVersion = '1.99.0'
            getOrDetectSamCliStub.resolves({ path: expectedPath })
            executeStub.resolves({ version: expectedVersion })

            const result = await getSamCliPathAndVersion()

            assert.strictEqual(result.path, expectedPath)
            assert.strictEqual(result.parsedVersion?.version, expectedVersion)
            assert(telemetryStub.calledOnceWith({ version: expectedVersion }))
        })

        it('throws MissingExecutable error when SAM CLI path is undefined', async () => {
            getOrDetectSamCliStub.resolves({ path: undefined })

            try {
                await getSamCliPathAndVersion()
                assert.fail('Should have thrown an error')
            } catch (error) {
                assert(error instanceof ToolkitError)
                assert.strictEqual(error.code, 'MissingExecutable')
                assert.strictEqual(error.message, 'SAM CLI could not be found')
                assert(telemetryStub.notCalled)
            }
        })

        it('throws VersionTooLow error when SAM CLI version is below 1.53.0', async () => {
            const lowVersion = '1.52.0'
            getOrDetectSamCliStub.resolves({ path: '/usr/local/bin/sam' })
            executeStub.resolves({ version: lowVersion })

            try {
                await getSamCliPathAndVersion()
                assert.fail('Should have thrown an error')
            } catch (error) {
                assert(error instanceof ToolkitError)
                assert.strictEqual(error.code, 'VersionTooLow')
                assert.strictEqual(error.message, 'SAM CLI version 1.53.0 or higher is required')
                // records telemetry even when version is too low
                assert(telemetryStub.calledOnceWith({ version: lowVersion }))
            }
        })
    })

    describe('get/update recent response', () => {
        // Create stub for globals.context.workspaceState.get
        const mementoRootKey = 'samcli.utils.key'
        const nonExistingMementoRootKey = 'samcli.utils.no.key'
        const identifier = 'us-east-1'
        const key1 = 'stackName'
        const key2 = 'bucketName'
        const value1 = 'myStackName'
        const value2 = 'myBucketName'

        after(async () => {
            await globals.context.workspaceState.update(mementoRootKey, {})
        })

        it('1. getRecentResponse should return undefined when mementoRootKey does not exist', async () => {
            assert(!getRecentResponse(nonExistingMementoRootKey, identifier, key1))
        })

        it('2. updateRecentResponse should return the undefined when mementoRootKey does not exist', async () => {
            try {
                await updateRecentResponse(mementoRootKey, identifier, key1, value1)
            } catch (err) {
                assert.fail('The execution should have succeeded yet encounter unexpected exception')
            }
        })

        it('3. getRecentResponse should return the correct value', async () => {
            const result = getRecentResponse(mementoRootKey, identifier, key1)
            assert.strictEqual(result, value1)
        })

        it('4. updateRecentResponse should only update the specified key', async () => {
            await updateRecentResponse(mementoRootKey, identifier, key2, value2)
            const result1 = getRecentResponse(mementoRootKey, identifier, key1)
            const result2 = getRecentResponse(mementoRootKey, identifier, key2)
            assert.strictEqual(result1, value1)
            assert.strictEqual(result2, value2)
        })

        it('5. updateRecentResponse should log and swallow exception when fails to update value', async () => {
            sinon.stub(globals.context.workspaceState, 'update').rejects(new Error('Error updating value'))
            try {
                await updateRecentResponse(mementoRootKey, identifier, key2, value2)
            } catch (err) {
                assert.fail('The target function should have handled exception internally')
            }
            assertLogsContain(`sam: unable to save response at key`, false, 'warn')
            sinon.restore()
        })
    })

    describe('gets the SAM CLI error from stderr', async function () {
        it('returns the error message', async function () {
            const stderr =
                'Starting Build use cache\nStarting Build inside a container\nCache is invalid, running build and copying resources for following functions (ResizerFunction)\nBuilding codeuri: /Users/mbfreder/TestApp/JavaSamApp/serverless-patterns/s3lambda-resizing-python/src runtime: python3.12 metadata: {} architecture: x86_64 functions: ResizerFunction\nError: Docker is unreachable. Docker needs to be running to build inside a container.'
            const response = getSamCliErrorMessage(stderr)
            assert.deepStrictEqual(
                response,
                'Error: Docker is unreachable. Docker needs to be running to build inside a container.'
            )
        })
    })

    describe('throwIfErrorMatches', async function () {
        it('should throw a ToolkitError with the correct code when an error message matches', () => {
            const mockError = new Error('Mock Error')
            const mockResult: ChildProcessResult = {
                exitCode: 1,
                error: mockError,
                stdout: '',
                stderr: 'Docker is unreachable.',
            }
            assert.throws(
                () => throwIfErrorMatches(mockResult),
                (e: any) => {
                    assert.strictEqual(e instanceof ToolkitError, true)
                    assert.strictEqual(e.code, 'DockerUnreachable')
                    return true
                }
            )
        })
    })
})
