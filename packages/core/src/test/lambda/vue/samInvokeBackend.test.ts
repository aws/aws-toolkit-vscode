/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    LaunchConfigPickItem,
    ResourceData,
    SamInvokeWebview,
    finalizeConfig,
} from '../../../lambda/vue/configEditor/samInvokeBackend'
import { ExtContext } from '../../../shared/extensions'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import assert from 'assert'
import sinon from 'sinon'
import * as picker from '../../../shared/ui/picker'
import * as utils from '../../../lambda/utils'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import * as vscode from 'vscode'
import path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared'
import { remove } from 'fs-extra'

const mockResourceData: ResourceData = {
    logicalId: 'MockFunction',
    region: 'us-west-2',
    arn: 'arn:aws:lambda:us-west-2:123456789012:function:MockFunction',
    location: '/path/to/function',
    handler: 'index.handler',
    runtime: 'nodejs14.x',
    stackName: 'MockStack',
    source: 'path/to/source',
}
const mockConfig: AwsSamDebuggerConfiguration = {
    invokeTarget: {
        target: 'template',
        logicalId: 'foobar',
        templatePath: 'template.yaml',
    },
    name: 'noprune',
    type: 'aws-sam',
    request: 'direct-invoke',
    sam: {
        containerBuild: false,
        skipNewImageCheck: false,
    },
}

describe('SamInvokeWebview', () => {
    let samInvokeWebview: SamInvokeWebview
    let mockExtContext: ExtContext
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        mockExtContext = {} as ExtContext
        sandbox = sinon.createSandbox()
        samInvokeWebview = new SamInvokeWebview(mockExtContext, mockConfig, mockResourceData)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should return undefined when no resource data is provided', () => {
        const noResourceWebview = new SamInvokeWebview(mockExtContext, mockConfig, undefined)
        const data = noResourceWebview.getResourceData()

        // Using assert to check if the data is undefined
        assert.strictEqual(data, undefined, 'Expected resource data to be undefined when no resource is provided')
    })

    describe('getFileName', () => {
        it('should return the base name of a file path', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const testCases = [{ input: vscode.Uri.file(path.join(tempFolder, 'file.txt')), expected: 'file.txt' }]

            testCases.forEach(({ input, expected }) => {
                const result = samInvokeWebview.getFileName(input.fsPath)
                assert.strictEqual(result, expected, `getFileName("${input}") should return "${expected}"`)

                // Double-check using Node's path.basename
                const nodeResult = path.basename(input.fsPath)
                assert.strictEqual(
                    result,
                    nodeResult,
                    `getFileName result should match Node's path.basename for "${input}"`
                )
            })
            await remove(tempFolder)
        })
    })

    describe('getResourceData', () => {
        it('should return the provided resource data', () => {
            const result = samInvokeWebview.getResourceData()
            assert.deepStrictEqual(result, mockResourceData)
        })
    })

    describe('init', () => {
        it('should return the provided config', () => {
            // Call the init method and store the result
            const result = samInvokeWebview.init()
            // Use strictEqual to assert that the result matches the provided config
            assert.strictEqual(result, mockConfig, 'The init method should return the provided config object')
        })
    })
    describe('getRuntimes', () => {
        it('should return sorted runtimes', () => {
            const runtimes = samInvokeWebview.getRuntimes()
            // Assert that the runtimes are defined
            assert(runtimes !== undefined, 'Runtimes should be defined')
            // Assert that runtimes is an array
            assert(Array.isArray(runtimes), 'Runtimes should be an array')
            // Assert that the runtimes array contains specific values
            assert(runtimes.includes('nodejs18.x'), "Runtimes should include 'nodejs18.x'")
            assert(runtimes.includes('python3.12'), "Runtimes should include 'python3.12'")
            // Assert that the runtimes array is sorted
            assert.deepStrictEqual(runtimes, [...runtimes].sort(), 'Runtimes should be sorted')
        })
    })
    describe('getSamplePayload', () => {
        let getSampleLambdaPayloadsStub: sinon.SinonStub
        let createQuickPickStub: sinon.SinonStub
        let promptUserStub: sinon.SinonStub
        let verifySinglePickerOutputStub: sinon.SinonStub
        let httpFetcherStub: sinon.SinonStub

        beforeEach(() => {
            getSampleLambdaPayloadsStub = sinon.stub(utils, 'getSampleLambdaPayloads')
            createQuickPickStub = sinon.stub(picker, 'createQuickPick')
            promptUserStub = sinon.stub(picker, 'promptUser')
            verifySinglePickerOutputStub = sinon.stub(picker, 'verifySinglePickerOutput')
            httpFetcherStub = sinon.stub(HttpResourceFetcher.prototype, 'get')
        })

        afterEach(() => {
            sinon.restore()
        })

        it('should return sample payload when user selects a sample', async () => {
            const mockPayloads = [{ name: 'testEvent', filename: 'testEvent.json' }]
            const mockSampleContent = '{ "test": "data" }'

            getSampleLambdaPayloadsStub.resolves(mockPayloads)
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'testEvent', filename: 'testEvent.json' }])
            verifySinglePickerOutputStub.returns({ label: 'testEvent', filename: 'testEvent.json' })
            httpFetcherStub.resolves(mockSampleContent)

            const result = await samInvokeWebview.getSamplePayload()

            assert.strictEqual(result, mockSampleContent)
        })
    })
    describe('loadSamLaunchConfig', () => {
        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('loadSamLaunchConfig should return selected config when available', async () => {
            const mockPickerItem: LaunchConfigPickItem = {
                index: 1,
                label: 'Tester Config',
                config: mockConfig,
            }

            sandbox.stub(samInvokeWebview, 'getSamLaunchConfigs').resolves([mockPickerItem])
            const pickerStub = sandbox.stub(picker, 'createQuickPick')
            const promptUserStub = sandbox.stub(picker, 'promptUser').resolves([mockPickerItem])

            const result = await samInvokeWebview.loadSamLaunchConfig()

            assert.strictEqual(result, mockConfig) // No config should be returned
            assert.ok(pickerStub.calledOnce)
            assert.ok(promptUserStub.calledOnce)
        })

        it('loadSamLaunchConfig should show no config message when none available', async () => {
            sandbox.stub(samInvokeWebview, 'getSamLaunchConfigs').resolves([])
            sandbox.stub(picker, 'createQuickPick')
            sandbox.stub(picker, 'promptUser').resolves([])

            const result = await samInvokeWebview.loadSamLaunchConfig()

            assert.strictEqual(result, undefined)
        })
    })
    describe('Sam Invoke Vue Backend', () => {
        describe('finalizeConfig', () => {
            it('prunes configs correctly', () => {
                const configs: { input: AwsSamDebuggerConfiguration; output: AwsSamDebuggerConfiguration }[] = [
                    {
                        input: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'noprune',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                        },
                        output: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'noprune',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                        },
                    },
                    {
                        input: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            lambda: {
                                payload: {
                                    json: {},
                                },
                            },
                            name: 'prunejson',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                        },
                        output: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'prunejson',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                        },
                    },
                    {
                        input: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'prunestr',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                            lambda: {
                                runtime: '',
                            },
                        },
                        output: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'prunestr',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                        },
                    },
                    {
                        input: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'prunearr',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                            lambda: {
                                pathMappings: [],
                            },
                        },
                        output: {
                            invokeTarget: {
                                target: 'template',
                                logicalId: 'foobar',
                                templatePath: 'template.yaml',
                            },
                            name: 'prunearr',
                            type: 'aws-sam',
                            request: 'direct-invoke',
                        },
                    },
                ]

                for (const config of configs) {
                    assert.deepStrictEqual(
                        finalizeConfig(config.input, config.input.name),
                        config.output,
                        `Test failed for input: ${config.input.name}`
                    )
                }
            })
        })
    })
})
