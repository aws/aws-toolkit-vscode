/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { detectLocalTemplates } from '../../../lambda/local/detectLocalTemplates'
import * as paramUtils from '../../../lambda/utilities/parameterUtils'
import {
    ParameterPromptResult,
    SamDeployWizard,
    SamDeployWizardContext,
    validateS3Bucket,
} from '../../../lambda/wizards/samDeployWizard'
import { CloudFormationStackPickerResponse } from '../../../shared/cloudformation/stackPicker'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { RegionProvider } from '../../../shared/regions/regionProvider'

async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

interface QuickPickUriResponseItem extends vscode.QuickPickItem {
    uri: vscode.Uri
}

function createQuickPickUriResponseItem(uri: vscode.Uri): QuickPickUriResponseItem {
    return {
        label: '',
        uri: uri,
    }
}

interface QuickPickRegionResponseItem extends vscode.QuickPickItem {
    detail: string
}

function createQuickPickRegionResponseItem(detail: string): QuickPickRegionResponseItem {
    return {
        label: '',
        detail: detail,
    }
}

class MockRegionProvider implements RegionProvider {
    public async getRegionData(): Promise<RegionInfo[]> {
        return [{
            regionCode: 'us-west-2',
            regionName: 'TEST REGION'
        }]
    }
}

class MockSamDeployWizardContext implements SamDeployWizardContext {
    public static readonly sampleExistingStackName: string = 'sampleExistingStack'
    public static readonly sampleNewStackName: string = 'sampleNewStack'

    private readonly existingStackResponse: (region: string) => CloudFormationStackPickerResponse
    private readonly newStackResponse: () => string | undefined

    public get workspaceFolders(): vscode.Uri[] | undefined {
        if (this.workspaceFoldersResponses.length <= 0) {
            throw new Error('workspaceFolders was called more times than expected')
        }

        return this.workspaceFoldersResponses.pop()
    }

    public constructor(
        public readonly onDetectLocalTemplates: typeof detectLocalTemplates,
        private readonly workspaceFoldersResponses: (vscode.Uri[] | undefined)[] = [],
        private readonly promptForSamTemplateResponses: (QuickPickUriResponseItem | undefined)[] = [],
        private readonly promptForRegionResponses: (QuickPickRegionResponseItem | undefined)[] = [],
        private readonly promptForS3BucketResponses: (string | undefined)[] = [],
        // todo : convert all of the remaining constructor inputs to be callback driven
        {
            existingStackResponse = (region: string) => makeInputTextCloudFormationStackPickerResponse(
                MockSamDeployWizardContext.sampleExistingStackName
            ),
            newStackResponse = () => undefined
        }: {
            existingStackResponse?(region: string): CloudFormationStackPickerResponse,
            newStackResponse?(): string | undefined
        }
    ) {
        this.workspaceFoldersResponses = workspaceFoldersResponses.reverse()
        this.promptForSamTemplateResponses = promptForSamTemplateResponses.reverse()
        this.promptForRegionResponses = promptForRegionResponses.reverse()
        this.promptForS3BucketResponses = promptForS3BucketResponses.reverse()

        this.existingStackResponse = existingStackResponse
        this.newStackResponse = newStackResponse
    }

    public readonly getOverriddenParameters: typeof paramUtils.getOverriddenParameters = async () => undefined

    public readonly getParameters: typeof paramUtils.getParameters = async () => new Map()

    public readonly promptUserForParametersIfApplicable: (
        options: {
            templateUri: vscode.Uri
            missingParameters?: Set<string>
        }
    ) => Promise<ParameterPromptResult> = async () => ParameterPromptResult.Continue

    public async promptUserForSamTemplate(): Promise<vscode.Uri | undefined> {
        if (this.promptForSamTemplateResponses.length <= 0) {
            throw new Error('promptUserForSamTemplate was called more times than expected')
        }

        const response = this.promptForSamTemplateResponses.pop()
        if (!response) { return undefined }

        return response.uri
    }

    public async promptUserForS3Bucket(initialValue?: string): Promise<string | undefined> {
        if (this.promptForS3BucketResponses.length <= 0) {
            throw new Error('promptUserForS3Bucket was called more times than expected')
        }

        return this.promptForS3BucketResponses.pop()
    }

    public async promptUserForRegion(
        regionProvider: RegionProvider,
        initialValue?: string): Promise<string | undefined> {
        if (this.promptForRegionResponses.length <= 0) {
            throw new Error('promptUserForRegion was called more times than expected')
        }

        const response = this.promptForRegionResponses.pop()
        if (!response) { return undefined }

        return response.detail
    }

    public async promptUserForExistingStackName(region: string): Promise<CloudFormationStackPickerResponse> {
        return this.existingStackResponse(region)
    }

    public async promptUserForNewStackName(): Promise<string | undefined> {
        return this.newStackResponse()
    }
}

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('SamDeployWizard', async () => {
    describe('TEMPLATE', async () => {
        it('fails gracefully when no templates are found', async () => {
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield* [] },
                    [[]],
                    [undefined],
                    [],
                    [],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('exits wizard when cancelled', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [undefined],
                    [],
                    [],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('uses user response as template', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath))
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    ['mys3bucketname'],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath)
        })
    })

    describe('PARAMETER_OVERRIDES', async () => {
        function makeFakeContext({
            getParameters,
            getOverriddenParameters,
            promptUserForParametersIfApplicable,
            templatePath = path.join('my', 'template'),
            region = 'us-east-1',
            s3Bucket = 'mys3bucket',
            stackName = 'mystackname'
        }: Pick<SamDeployWizardContext,
            'getParameters' | 'getOverriddenParameters' | 'promptUserForParametersIfApplicable'
        > & {
            templatePath?: string
            region?: string
            s3Bucket?: string
            stackName?: string
        }): SamDeployWizardContext {
            return {
                // It's fine to return an empty list if promptUserForSamTemplate is overridden.
                onDetectLocalTemplates: () => asyncGenerator([]),
                // It's fine to return an empty list if promptUserForSamTemplate is overridden.
                workspaceFolders: [],

                getParameters,
                getOverriddenParameters,
                promptUserForParametersIfApplicable,
                promptUserForSamTemplate: async () => vscode.Uri.file(templatePath),
                promptUserForRegion: async () => region,
                promptUserForS3Bucket: async () => s3Bucket,
                promptUserForExistingStackName: async () => makeInputTextCloudFormationStackPickerResponse(stackName),
                promptUserForNewStackName: async () => { throw new Error('new stackname not used in this test') },
            }
        }

        describe('SAM template has no parameters', async () => {
            it('skips configuring overrides and continues wizard', async () => {
                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([]),
                    getOverriddenParameters: async () => { throw new Error('Should skip loading overrides') },
                    promptUserForParametersIfApplicable: async () => {
                        throw new Error('Should skip configuring overrides')
                    },
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 0)
            })
        })

        describe('SAM template has only optional parameters', async () => {
            it('skips configuring overrides and continues wizard if parameterOverrides is defined', async () => {
                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([
                        ['myParam', { required: false }]
                    ]),
                    getOverriddenParameters: async () => new Map<string, string>(),
                    promptUserForParametersIfApplicable: async () => {
                        throw new Error('Should skip configuring overrides')
                    },
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 0)
            })

            // tslint:disable-next-line:max-line-length
            it('skips configuring overrides and continues wizard if parameterOverrides is undefined and user declines prompt', async () => {
                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([
                        ['myParam', { required: false }]
                    ]),
                    getOverriddenParameters: async () => undefined,
                    promptUserForParametersIfApplicable: async () => ParameterPromptResult.Continue,
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 0)
            })

            // tslint:disable-next-line:max-line-length
            it('configures overrides and cancels wizard if parameterOverrides is undefined and user accepts prompt', async () => {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri,
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([
                        ['myParam', { required: false }]
                    ]),
                    getOverriddenParameters: async () => undefined,
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.strictEqual(result, undefined)
                assert.strictEqual(configureParameterOverridesArgs.length, 1)
                assert.strictEqual(configureParameterOverridesArgs[0].missingParameters, undefined)
            })
        })

        describe('SAM template has required parameters', async () => {
            // tslint:disable-next-line:max-line-length
            it('configures overrides and cancels wizard if overrides are not defined', async () => {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri,
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([
                        ['myParam', { required: true }]
                    ]),
                    getOverriddenParameters: async () => undefined,
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.strictEqual(result, undefined)
                assert.strictEqual(configureParameterOverridesArgs.length, 1)
                assert.ok(configureParameterOverridesArgs[0].missingParameters)
                assert.strictEqual(configureParameterOverridesArgs[0].missingParameters!.has('myParam'), true)
            })

            // tslint:disable-next-line:max-line-length
            it('configures overrides and cancels wizard if there are missing overrides', async () => {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri,
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([
                        ['myParam', { required: true }]
                    ]),
                    getOverriddenParameters: async () => new Map<string, string>(),
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.strictEqual(result, undefined)
                assert.strictEqual(configureParameterOverridesArgs.length, 1)
                assert.ok(configureParameterOverridesArgs[0].missingParameters)
                assert.strictEqual(configureParameterOverridesArgs[0].missingParameters!.has('myParam'), true)
            })

            // tslint:disable-next-line:max-line-length
            it('stores existing overrides and continues without configuring overrides if there are no missing overrides', async () => {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri,
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([
                        ['myParam', { required: true }]
                    ]),
                    getOverriddenParameters: async () => new Map<string, string>([
                        ['myParam', 'myValue']
                    ]),
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(new MockRegionProvider(), context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 1)
                assert.strictEqual(result!.parameterOverrides.has('myParam'), true)
                assert.strictEqual(result!.parameterOverrides.get('myParam'), 'myValue')
                assert.strictEqual(configureParameterOverridesArgs.length, 0)
            })
        })
    })

    describe('REGION', async () => {
        it('uses user response for region', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder', '1')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const region = 'us-east-1'

            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () {
                        yield vscode.Uri.file(templatePath)
                    },
                    [
                        [vscode.Uri.file(workspaceFolderPath)]
                    ],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath))
                    ],
                    [
                        createQuickPickRegionResponseItem(region)
                    ],
                    [
                        'mys3bucketname'
                    ],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.region, region)
        })

        it('goes back when cancelled', async () => {
            const workspaceFolderPath1 = normalizePath('my', 'workspace', 'folder', '1')
            const workspaceFolderPath2 = normalizePath('my', 'workspace', 'folder', '2')
            const templatePath1 = normalizePath(workspaceFolderPath1, 'template.yaml')
            const templatePath2 = normalizePath(workspaceFolderPath2, 'template.yaml')
            const region = 'us-east-1'

            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () {
                        yield vscode.Uri.file(templatePath1)
                        yield vscode.Uri.file(templatePath2)
                    },
                    [
                        [vscode.Uri.file(workspaceFolderPath1)],
                        [vscode.Uri.file(workspaceFolderPath2)]
                    ],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath1)),
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath2)),
                    ],
                    [
                        undefined, // First time we ask about the S3 Bucket, cancel back to the template step
                        createQuickPickRegionResponseItem(region)
                    ],
                    [
                        'mys3bucketname'
                    ],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath2)
        })
    })

    describe('S3_BUCKET', async () => {
        it('goes back when cancelled', async () => {
            const workspaceFolderPath1 = normalizePath('my', 'workspace', 'folder', '1')
            const workspaceFolderPath2 = normalizePath('my', 'workspace', 'folder', '2')
            const templatePath1 = normalizePath(workspaceFolderPath1, 'template.yaml')
            const templatePath2 = normalizePath(workspaceFolderPath2, 'template.yaml')
            const region1 = 'us-east-1'
            const region2 = 'us-east-2'

            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () {
                        yield vscode.Uri.file(templatePath1)
                        yield vscode.Uri.file(templatePath2)
                    },
                    [
                        [vscode.Uri.file(workspaceFolderPath1)],
                        [vscode.Uri.file(workspaceFolderPath2)]
                    ],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath1)),
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath2)),
                    ],
                    [
                        createQuickPickRegionResponseItem(region1),
                        createQuickPickRegionResponseItem(region2)
                    ],
                    [
                        undefined, // First time we ask about the S3 Bucket, cancel back to the region step
                        'mys3bucketname'
                    ],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath1)
            assert.strictEqual(result!.region, region2)
        })

        it('uses user response as s3Bucket', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath)),
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    ['mys3bucketname'],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname')
        })
    })

    describe('STACK_PICK_EXISTING', async () => {
        it('goes back when cancelled', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            let existingStackResponseCallCount: number = 0
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath)),
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    [
                        'mys3bucketname1',
                        'mys3bucketname2',
                    ],
                    {
                        existingStackResponse: (region) => {
                            existingStackResponseCallCount++
                            switch (existingStackResponseCallCount) {
                                case 1:
                                    return makeCancelledCloudFormationStackPickerResponse()
                                case 2:
                                    return makeInputTextCloudFormationStackPickerResponse('irrelevant')
                                default:
                                    assert.fail('existing stack name was called too many times')
                                    throw new Error('bad test')
                            }
                        }
                    }
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname2')
        })

        it('uses user response as stackName', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath)),
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    [
                        'mys3bucketname',
                    ],
                    {}
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.stackName, MockSamDeployWizardContext.sampleExistingStackName)
        })

        it('advances to STACK_INPUT_NEW if "create new stack" is requested', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            let newStackResponseRequested: boolean = false
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath)),
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    [
                        'mys3bucketname1',
                    ],
                    {
                        existingStackResponse: (region) => makeCreateStackCloudFormationStackPickerResponse(),
                        newStackResponse: () => {
                            newStackResponseRequested = true

                            return 'someNewStackName'
                        }
                    }
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(newStackResponseRequested, true, 'Expected new stack response to get called')
        })
    })

    describe('STACK_INPUT_NEW', async () => {
        it('goes back to STACK_PICK_EXISTING when cancelled', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            let existingStackResponseCallCount: number = 0
            let newStackResponseCallCount: number = 0
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath)),
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    [
                        'mys3bucketname1',
                    ],
                    {
                        existingStackResponse: (region) => {
                            existingStackResponseCallCount++
                            switch (existingStackResponseCallCount) {
                                case 1:
                                    return makeCreateStackCloudFormationStackPickerResponse()
                                case 2:
                                    return makeInputTextCloudFormationStackPickerResponse('irrelevant')
                                default:
                                    assert.fail('existing stack name was called too many times')
                                    throw new Error('bad test')
                            }
                        },
                        newStackResponse: () => {
                            newStackResponseCallCount++

                            return undefined
                        }
                    }
                )
            )
            await wizard.run()

            assert.strictEqual(existingStackResponseCallCount, 2, 'Expected to enter the existing stack selection 2x')
            assert.strictEqual(newStackResponseCallCount, 1, 'Expected to enter the new stack input 1x')
        })

        it('uses user response as stackName', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const newStackName = 'someNewStackName'
            const wizard = new SamDeployWizard(
                new MockRegionProvider(),
                new MockSamDeployWizardContext(
                    // tslint:disable-next-line:space-before-function-paren
                    async function* () { yield vscode.Uri.file(templatePath) },
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath)),
                    ],
                    [
                        createQuickPickRegionResponseItem('asdf')
                    ],
                    [
                        'mys3bucketname',
                    ],
                    {
                        existingStackResponse: (region) => makeCreateStackCloudFormationStackPickerResponse(),
                        newStackResponse: () => newStackName
                    }
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.stackName, newStackName)
        })
    })
})

describe('validateS3Bucket', async () => {
    function assertS3BucketValidationFails(bucketName: string) {
        assert.notStrictEqual(
            validateS3Bucket(bucketName),
            undefined,
            `Expected validation for S3 bucket name '${bucketName}' to fail, but it passed.`
        )
    }

    it('validates a valid bucket name', async () => {
        assert.strictEqual(
            validateS3Bucket('validbucketname'),
            undefined,
            'failed to validate valid bucket name'
        )
    })

    it('validates that bucket name has a valid length', async () => {
        assertS3BucketValidationFails('aa')
        assertS3BucketValidationFails('aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffffgggggggghhhhhhhh')
    })

    it('validates that bucket name does not contain invalid characters', async () => {
        assertS3BucketValidationFails('aaA')
        assertS3BucketValidationFails('aa_')
        assertS3BucketValidationFails('aa$')
    })

    it('validates that bucket name is not formatted as an ip address', async () => {
        assertS3BucketValidationFails('198.51.100.24')
    })

    it('validates that bucket name does not end with a dash', async () => {
        assertS3BucketValidationFails('aa-')
    })

    it('validates that bucket name does not contain consecutive periods', async () => {
        assertS3BucketValidationFails('a..a')
    })

    it('validates that bucket name does not contain a period adjacent to a dash', async () => {
        assertS3BucketValidationFails('a.-a')
        assertS3BucketValidationFails('a-.a')
    })

    it('validates that each label in bucket name begins with a number or a lower-case character', async () => {
        assertS3BucketValidationFails('Aaa')
        assertS3BucketValidationFails('aaa.Bbb')
    })
})

function makeInputTextCloudFormationStackPickerResponse(inputText: string): CloudFormationStackPickerResponse {
    return {
        cancelled: false,
        createStackButtonPressed: false,
        inputText,
    }
}

function makeCancelledCloudFormationStackPickerResponse(): CloudFormationStackPickerResponse {
    return {
        cancelled: true,
        createStackButtonPressed: false,
    }
}

function makeCreateStackCloudFormationStackPickerResponse(): CloudFormationStackPickerResponse {
    return {
        cancelled: false,
        createStackButtonPressed: true,
    }
}
