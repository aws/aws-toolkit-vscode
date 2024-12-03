/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AwsSamDebuggerConfigurationLoose,
    LaunchConfigPickItem,
    ResourceData,
    SamInvokeWebview,
    finalizeConfig,
} from '../../../lambda/vue/configEditor/samInvokeBackend'
import { ExtContext } from '../../../shared/extensions'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import assert from 'assert'
import * as picker from '../../../shared/ui/picker'
import * as input from '../../../shared/ui/input'
import * as utils from '../../../lambda/utils'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import * as vscode from 'vscode'
import path from 'path'
import { addCodiconToString, fs, makeTemporaryToolkitFolder } from '../../../shared'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { getTestWindow } from '../..'
import * as extensionUtilities from '../../../shared/extensionUtilities'
import * as samInvokeBackend from '../../../lambda/vue/configEditor/samInvokeBackend'
import { SamDebugConfigProvider } from '../../../shared/sam/debugger/awsSamDebugger'
import sinon from 'sinon'
import * as nls from 'vscode-nls'
import { assertLogsContain } from '../../../test/globalSetup.test'

const localize = nls.loadMessageBundle()

function createMockWorkspaceFolder(uriPath: string): vscode.WorkspaceFolder {
    return {
        uri: vscode.Uri.file(uriPath),
        name: 'mock-folder',
        index: 0,
    }
}

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
const mockConfig: AwsSamDebuggerConfigurationLoose = {
    invokeTarget: {
        target: 'template',
        logicalId: 'foobar',
        templatePath: 'template.yaml',
        lambdaHandler: 'index.handler',
        projectRoot: '/path/to/project',
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
            await fs.delete(tempFolder, { recursive: true })
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

        it('should throw an error if fetching sample data fails', async () => {
            getSampleLambdaPayloadsStub.resolves([{ name: 'testEvent', filename: 'testEvent.json' }])
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'testEvent', filename: 'testEvent.json' }])
            verifySinglePickerOutputStub.returns({ label: 'testEvent', filename: 'testEvent.json' })
            httpFetcherStub.rejects(new Error('Fetch failed'))

            await assert.rejects(async () => {
                await samInvokeWebview.getSamplePayload()
            }, /Error: getting manifest data/)
        })
        it('returns undefined if no sample is selected', async () => {
            const mockPayloads = [{ name: 'testEvent', filename: 'testEvent.json' }]
            getSampleLambdaPayloadsStub.resolves(mockPayloads)
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'testEvent', filename: 'testEvent.json' }])
            verifySinglePickerOutputStub.returns(undefined)
            const result = await samInvokeWebview.getSamplePayload()

            assert.strictEqual(result, undefined)
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

    describe('SamInvokeWebview - getSamLaunchConfigs', function () {
        let workspaceFoldersStub: sinon.SinonStub
        let launchConfigStub: sinon.SinonStub
        let getLaunchConfigQuickPickItemsStub: sinon.SinonStub

        beforeEach(() => {
            // Initialize a new webview instance before each test
            workspaceFoldersStub = sandbox.stub(vscode.workspace, 'workspaceFolders')
            launchConfigStub = sandbox.stub(LaunchConfiguration.prototype, 'getDebugConfigurations')
            getLaunchConfigQuickPickItemsStub = sandbox.stub()
        })
        afterEach(() => {
            sandbox.restore()
        })

        it('should return undefined and show error when no workspace folder is found', async function () {
            // Mock workspace without folders
            workspaceFoldersStub.value([])
            const result = await samInvokeWebview.getSamLaunchConfigs()
            assert.strictEqual(result, undefined)
        })

        it('should return picker items if valid configurations exist', async () => {
            const mockFolder = createMockWorkspaceFolder('/mock-path')
            const mockUri = mockFolder.uri
            workspaceFoldersStub.value([mockFolder])

            // Mock a launch configuration
            launchConfigStub.returns([mockConfig])

            // Mock picker items
            const mockPickerItems = [{ index: 0, config: mockConfig, label: 'Test Config' }]
            getLaunchConfigQuickPickItemsStub.resolves(mockPickerItems)

            // Override the internal `getLaunchConfigQuickPickItems` function
            sandbox.replace(samInvokeWebview as any, 'getLaunchConfigQuickPickItems', getLaunchConfigQuickPickItemsStub)

            const result = await samInvokeWebview.getSamLaunchConfigs()

            assert.deepStrictEqual(result, mockPickerItems)
            assert(getLaunchConfigQuickPickItemsStub.calledOnceWithExactly(sinon.match.any, mockUri))
        })
    })
    describe('promptFile', () => {
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
            await fs.delete(tempFolder, { recursive: true })
        })
        it('prompts the user for a file and returns the selected file', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const placeholderEventFile = path.join(tempFolder, 'file.json')
            await fs.writeFile(placeholderEventFile, '{"sample": "{test: event}"}')
            const fileUri = vscode.Uri.file(placeholderEventFile)

            getTestWindow().onDidShowDialog((window) => window.selectItem(fileUri))

            const response = await samInvokeWebview.promptFile()
            if (response === undefined) {
                assert.fail('Response should not be undefined')
            }
            assert.deepStrictEqual(response.selectedFile, 'file.json')
            assert.deepStrictEqual(response.selectedFilePath, fileUri.fsPath)
            await fs.delete(tempFolder, { recursive: true })
        })
        it('Returns undefined if no file is selected', async () => {
            getTestWindow().onDidShowDialog((window) => window.close())
            const response = await samInvokeWebview.promptFile()
            assert.strictEqual(response, undefined)
        })
        it('logs an error and throws ToolkitError when reading the file fails', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const placeholderEventFile = path.join(tempFolder, 'file.json')
            const fileUri = vscode.Uri.file(placeholderEventFile)

            getTestWindow().onDidShowDialog((window) => window.selectItem(fileUri))

            try {
                await assert.rejects(
                    async () => await samInvokeWebview.promptFile(),
                    new Error('Failed to read selected file')
                )
                assertLogsContain('readFileSync: Failed to read file at path', false, 'error')
            } finally {
                await fs.delete(tempFolder, { recursive: true })
            }
        })
    })
    describe('getTemplate', () => {
        let templateRegistryStub: sinon.SinonStub
        let createQuickPickStub: sinon.SinonStub
        let promptUserStub: sinon.SinonStub
        let verifySinglePickerOutputStub: sinon.SinonStub

        beforeEach(() => {
            templateRegistryStub = sandbox.stub()
            createQuickPickStub = sinon.stub(picker, 'createQuickPick')
            promptUserStub = sinon.stub(picker, 'promptUser')
            verifySinglePickerOutputStub = sinon.stub(picker, 'verifySinglePickerOutput')
        })

        afterEach(() => {
            sinon.restore()
        })

        it('should return undefined if no valid templates are found', async () => {
            templateRegistryStub.resolves({ items: [] })
            sandbox.replace(samInvokeWebview as any, 'getTemplateRegistry', templateRegistryStub)
            const result = await samInvokeWebview.getTemplate()

            assert.strictEqual(result, undefined)
        })

        it('should return a template if a valid SAM function is found', async () => {
            const mockTemplate = {
                path: '/path/to/template.yaml',
                item: {
                    Resources: {
                        MyLambda: { Type: 'AWS::Serverless::Function' },
                    },
                },
            }
            templateRegistryStub.resolves({ items: [mockTemplate] })
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'MyLambda', templatePath: '/path/to/template.yaml' }])
            verifySinglePickerOutputStub.returns({ label: 'MyLambda', templatePath: '/path/to/template.yaml' })

            const result = await samInvokeWebview.getTemplate()

            assert.deepEqual(result, {
                logicalId: 'MyLambda',
                template: '/path/to/template.yaml',
            })
        })

        it('should return undefined if user selects no valid template', async () => {
            templateRegistryStub.resolves({ items: [] })
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ templatePath: 'NOTEMPLATEFOUND' }])
            verifySinglePickerOutputStub.returns({ templatePath: 'NOTEMPLATEFOUND' })

            const result = await samInvokeWebview.getTemplate()

            assert.strictEqual(result, undefined)
        })

        it('should handle multiple templates and filter by resource type', async () => {
            const mockTemplates = [
                {
                    path: '/path/to/first.yaml',
                    item: {
                        Resources: {
                            Lambda1: { Type: 'AWS::Serverless::Function' },
                        },
                    },
                },
                {
                    path: '/path/to/second.yaml',
                    item: {
                        Resources: {
                            API: { Type: 'AWS::Serverless::Api' },
                        },
                    },
                },
            ]
            templateRegistryStub.resolves({ items: mockTemplates })
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'Lambda1', templatePath: '/path/to/first.yaml' }])
            verifySinglePickerOutputStub.returns({ label: 'Lambda1', templatePath: '/path/to/first.yaml' })

            const result = await samInvokeWebview.getTemplate()

            assert.deepEqual(result, {
                logicalId: 'Lambda1',
                template: '/path/to/first.yaml',
            })
        })

        it('should return undefined if picker returns no selection', async () => {
            const mockTemplate = {
                path: '/path/to/template.yaml',
                item: {
                    Resources: {
                        Lambda1: { Type: 'AWS::Serverless::Function' },
                    },
                },
            }
            templateRegistryStub.resolves({ items: [mockTemplate] })
            createQuickPickStub.returns({})
            promptUserStub.resolves(undefined)
            verifySinglePickerOutputStub.returns(undefined)

            const result = await samInvokeWebview.getTemplate()

            assert.strictEqual(result, undefined)
        })
    })
    describe('InvokeLocalWebview', function () {
        let sandbox: sinon.SinonSandbox
        let mockFolder: vscode.WorkspaceFolder
        let mockUri: vscode.Uri
        let getUriFromLaunchConfigStub: sinon.SinonStub
        let workspaceFoldersStub: sinon.SinonStub

        this.beforeEach(async function () {
            sandbox = sinon.createSandbox()
            mockFolder = createMockWorkspaceFolder('/mock-path')
            mockUri = mockFolder.uri

            sandbox.stub(samInvokeBackend, 'finalizeConfig').returns(mockConfig)
            getUriFromLaunchConfigStub = sinon.stub()
            sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockFolder)
            workspaceFoldersStub = sandbox.stub(vscode.workspace, 'workspaceFolders')
        })
        afterEach(() => {
            sandbox.restore()
        })

        it('should invoke launch config for non-Cloud9 environment', async () => {
            workspaceFoldersStub.value([mockFolder])
            sandbox.stub(extensionUtilities, 'isCloud9').returns(false)
            sandbox.replace(samInvokeWebview as any, 'getUriFromLaunchConfig', getUriFromLaunchConfigStub)
            getUriFromLaunchConfigStub.resolves(mockUri)

            const startDebuggingStub = sandbox.stub(vscode.debug, 'startDebugging').resolves(true)

            await samInvokeWebview.invokeLaunchConfig(mockConfig)

            assert(startDebuggingStub.called)
        })

        it('should invoke launch config for Cloud9 environment', async () => {
            workspaceFoldersStub.value([mockFolder])
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            sandbox.replace(samInvokeWebview as any, 'getUriFromLaunchConfig', getUriFromLaunchConfigStub)
            getUriFromLaunchConfigStub.resolves(mockUri)

            const startDebuggingStub = sandbox.stub(vscode.debug, 'startDebugging').resolves(true)

            await samInvokeWebview.invokeLaunchConfig(mockConfig)

            assert(startDebuggingStub.notCalled)
        })
        it('should use SamDebugConfigProvider for Cloud9 environment', async () => {
            sandbox.stub(extensionUtilities, 'isCloud9').returns(true)
            const SamDebugConfigProviderStub = sinon.stub(SamDebugConfigProvider.prototype, 'resolveDebugConfiguration')

            await samInvokeWebview.invokeLaunchConfig(mockConfig)

            assert(SamDebugConfigProviderStub.called)
        })
    })
    describe('saveLaunchConfig', function () {
        let sandbox: sinon.SinonSandbox
        let mockFolder: vscode.WorkspaceFolder
        let mockUri: vscode.Uri
        let getUriFromLaunchConfigStub: sinon.SinonStub
        let workspaceFoldersStub: sinon.SinonStub
        let getUriStub: sinon.SinonStub
        let launchConfigurationsStub: sinon.SinonStub
        let getLaunchConfigQuickPickItemsStub: sinon.SinonStub
        let editDebugConfigurationStub: sinon.SinonStub
        let verifySinglePickerOutputStub: sinon.SinonStub
        let createQuickPickStub: sinon.SinonStub

        this.beforeEach(async function () {
            sandbox = sinon.createSandbox()
            mockFolder = createMockWorkspaceFolder('/mock-path')
            mockUri = mockFolder.uri

            getUriStub = sandbox.stub(samInvokeWebview as any, 'getUriFromLaunchConfig')
            getUriFromLaunchConfigStub = sinon.stub()
            sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockFolder)
            workspaceFoldersStub = sandbox.stub(vscode.workspace, 'workspaceFolders')
            launchConfigurationsStub = sandbox.stub(LaunchConfiguration.prototype, 'getDebugConfigurations')
            editDebugConfigurationStub = sandbox.stub(LaunchConfiguration.prototype, 'editDebugConfiguration')
            getLaunchConfigQuickPickItemsStub = sandbox.stub()

            verifySinglePickerOutputStub = sandbox.stub(picker, 'verifySinglePickerOutput')
            createQuickPickStub = sandbox.stub(picker, 'createQuickPick')
        })
        afterEach(() => {
            sandbox.restore()
        })

        it('should create quick pick with correct items', async () => {
            getUriFromLaunchConfigStub.resolves(mockUri)
            getLaunchConfigQuickPickItemsStub.resolves([{ label: 'Existing Config', index: 0 }])
            verifySinglePickerOutputStub.returns(undefined)
            createQuickPickStub.returns({})
            sandbox.stub(picker, 'promptUser').resolves([])

            sandbox.replace(samInvokeWebview as any, 'getLaunchConfigQuickPickItems', getLaunchConfigQuickPickItemsStub)
            sandbox.replace(samInvokeWebview as any, 'getUriFromLaunchConfig', getUriFromLaunchConfigStub)

            await samInvokeWebview.saveLaunchConfig(mockConfig)
            assert(getLaunchConfigQuickPickItemsStub.called)

            sinon.assert.calledWith(
                createQuickPickStub,
                sinon.match({
                    items: sinon.match.array.deepEquals([
                        {
                            label: addCodiconToString(
                                'add',
                                localize(
                                    'AWS.command.addSamDebugConfiguration',
                                    'Add Local Invoke and Debug Configuration'
                                )
                            ),
                            index: -1,
                            alwaysShow: true,
                        },
                        { label: 'Existing Config', index: 0 },
                    ]),
                })
            )
        })
        describe('Save Launch Config with no URI', () => {
            let promptUserStub: sinon.SinonStub
            let testConfig: any
            beforeEach(() => {
                const testConfig = {
                    label: '$(add) Add Local Invoke and Debug Configuration',
                    index: -1,
                    alwaysShow: true,
                }
                // Create a stub for the promptUser function
                promptUserStub = sinon.stub(picker, 'promptUser')

                // Configure the stub to return the desired array
                promptUserStub.resolves([testConfig])
            })
            afterEach(() => {
                // Restore the original function after each test
                promptUserStub.restore()
            })
            it('should not save launch config', async () => {
                workspaceFoldersStub.value([mockFolder])
                sandbox.stub(extensionUtilities, 'isCloud9').returns(false)
                sandbox.replace(samInvokeWebview as any, 'getUriFromLaunchConfig', getUriFromLaunchConfigStub)
                const launchConfigItems = launchConfigurationsStub.resolves([])
                getUriFromLaunchConfigStub.resolves(mockUri)

                const mockPickerItems = [
                    {
                        label: addCodiconToString(
                            'add',
                            localize('AWS.command.addSamDebugConfiguration', 'Add Local Invoke and Debug Configuration')
                        ),
                        index: -1,
                        alwaysShow: true,
                    },
                    launchConfigItems,
                ]
                verifySinglePickerOutputStub.resolves([testConfig])
                getLaunchConfigQuickPickItemsStub.resolves(mockPickerItems)
                sandbox.replace(
                    samInvokeWebview as any,
                    'getLaunchConfigQuickPickItems',
                    getLaunchConfigQuickPickItemsStub
                )
                sinon.stub(input, 'createInputBox').resolves('testConfig')
                const updateStub = sandbox.stub(vscode.workspace, 'updateWorkspaceFolders')

                await samInvokeWebview.saveLaunchConfig(mockConfig)
                assert(getLaunchConfigQuickPickItemsStub.called)
                assert(verifySinglePickerOutputStub.called)
                assert(updateStub.notCalled)
            })
        })

        describe('Save Launch Config with no URI', () => {
            it('should not save if no URI is found', async () => {
                getUriStub.resolves(undefined)
                await samInvokeWebview.saveLaunchConfig(mockConfig)
                assert(launchConfigurationsStub.notCalled)
            })
        })
        describe('Save Launch Config', () => {
            let promptUserStub: sinon.SinonStub
            let mockSavedConfig: AwsSamDebuggerConfiguration

            beforeEach(() => {
                mockSavedConfig = {
                    type: 'aws-sam',
                    request: 'direct-invoke',
                    invokeTarget: {
                        target: 'template',
                        logicalId: 'HelloWorldFunction',
                        templatePath: 'template.yaml',
                    },
                    lambda: {
                        runtime: 'python3.9',
                    },
                    sam: {
                        containerBuild: false,
                        localArguments: ['-e', '/tester/events.json'],
                        skipNewImageCheck: false,
                    },
                    api: {
                        path: 'asdad',
                        httpMethod: 'get',
                    },
                    name: 'tester',
                }
                // Create a stub for the promptUser function
                promptUserStub = sinon.stub(picker, 'promptUser')

                // Configure the stub to return the desired array
                promptUserStub.resolves([mockSavedConfig])
            })

            afterEach(() => {
                // Restore the original function after each test
                promptUserStub.restore()
            })

            it('should save launch config', async () => {
                workspaceFoldersStub.value([mockFolder])
                sandbox.stub(extensionUtilities, 'isCloud9').returns(false)
                getUriFromLaunchConfigStub.resolves(mockUri)
                sandbox.replace(samInvokeWebview as any, 'getUriFromLaunchConfig', getUriFromLaunchConfigStub)
                const launchConfigItems = launchConfigurationsStub.resolves([
                    {
                        config: mockSavedConfig,
                        index: 0,
                        label: 'tester',
                    },
                ])
                const mockPickerItems = [
                    {
                        label: addCodiconToString(
                            'add',
                            localize('AWS.command.addSamDebugConfiguration', 'Add Local Invoke and Debug Configuration')
                        ),
                        index: -1,
                        alwaysShow: true,
                    },
                    launchConfigItems,
                ]
                verifySinglePickerOutputStub.resolves([
                    {
                        label: 'tester',
                        index: 0,
                        alwaysShow: true,
                    },
                ])
                getLaunchConfigQuickPickItemsStub.resolves(mockPickerItems)
                sandbox.replace(
                    samInvokeWebview as any,
                    'getLaunchConfigQuickPickItems',
                    getLaunchConfigQuickPickItemsStub
                )
                const updateStub = sandbox.stub(vscode.workspace, 'updateWorkspaceFolders')

                await samInvokeWebview.saveLaunchConfig(mockSavedConfig)

                assert(getLaunchConfigQuickPickItemsStub.called)
                assert(editDebugConfigurationStub.called)
                assert(verifySinglePickerOutputStub.called)
                assert(updateStub.notCalled)
            })
        })
    })
})
