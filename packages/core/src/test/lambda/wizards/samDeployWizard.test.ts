/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as paramUtils from '../../../lambda/config/parameterUtils'
import * as input from '../../../shared/ui/input'
import * as picker from '../../../shared/ui/picker'
import {
    ParameterPromptResult,
    SamDeployWizard,
    SamDeployWizardContext,
    DefaultSamDeployWizardContext,
} from '../../../lambda/wizards/samDeployWizard'
import { EcrRepository } from '../../../shared/clients/ecrClient'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { ExtContext } from '../../../shared/extensions'

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

class MockSamDeployWizardContext implements SamDeployWizardContext {
    public get workspaceFolders(): vscode.Uri[] | undefined {
        if (this.workspaceFoldersResponses.length <= 0) {
            throw new Error('workspaceFolders was called more times than expected')
        }

        return this.workspaceFoldersResponses.pop()
    }

    public constructor(
        readonly extContext: ExtContext,
        private readonly workspaceFoldersResponses: (vscode.Uri[] | undefined)[] = [],
        private readonly promptForSamTemplateResponses: (QuickPickUriResponseItem | undefined)[] = [],
        private readonly promptForRegionResponses: (QuickPickRegionResponseItem | undefined)[] = [],
        private readonly promptForS3BucketResponses: (string | undefined)[] = [],
        private readonly promptForNewS3BucketResponses: (string | undefined)[] = [],
        private readonly promptForEcrRepoResponses: (EcrRepository | undefined)[] = [],
        private readonly promptForStackNameResponses: (string | undefined)[] = [],
        private readonly hasImages: boolean = false
    ) {
        this.workspaceFoldersResponses = workspaceFoldersResponses.reverse()
        this.promptForSamTemplateResponses = promptForSamTemplateResponses.reverse()
        this.promptForRegionResponses = promptForRegionResponses.reverse()
        this.promptForS3BucketResponses = promptForS3BucketResponses.reverse()
        this.promptForNewS3BucketResponses = promptForNewS3BucketResponses.reverse()
        this.promptForEcrRepoResponses = promptForEcrRepoResponses.reverse()
        this.promptForStackNameResponses = promptForStackNameResponses.reverse()
    }

    additionalSteps: number = 0

    public readonly getOverriddenParameters: typeof paramUtils.getOverriddenParameters = async () => undefined

    public readonly getParameters: typeof paramUtils.getParameters = async () => new Map()

    public readonly promptUserForParametersIfApplicable: (options: {
        templateUri: vscode.Uri
        missingParameters?: Set<string>
    }) => Promise<ParameterPromptResult> = async () => ParameterPromptResult.Continue

    public async determineIfTemplateHasImages(templatePath: vscode.Uri): Promise<boolean> {
        return this.hasImages
    }

    public async promptUserForSamTemplate(): Promise<vscode.Uri | undefined> {
        if (this.promptForSamTemplateResponses.length <= 0) {
            throw new Error('promptUserForSamTemplate was called more times than expected')
        }

        const response = this.promptForSamTemplateResponses.pop()
        if (!response) {
            return undefined
        }

        return response.uri
    }

    public async promptUserForS3Bucket(stepNumber: number, initialValue?: string): Promise<string | undefined> {
        if (this.promptForS3BucketResponses.length <= 0) {
            throw new Error('promptUserForS3Bucket was called more times than expected')
        }

        return this.promptForS3BucketResponses.pop()
    }

    public async promptUserForS3BucketName(
        step: number,
        bucketProps: {
            title: string
            prompt?: string | undefined
            placeHolder?: string | undefined
            value?: string | undefined
            buttons?: vscode.QuickInputButton[] | undefined
            buttonHandler?:
                | ((
                      button: vscode.QuickInputButton,
                      inputBox: vscode.InputBox,
                      resolve: (value: string | PromiseLike<string | undefined> | undefined) => void,
                      reject: (value: string | PromiseLike<string | undefined> | undefined) => void
                  ) => void)
                | undefined
        }
    ): Promise<string | undefined> {
        if (this.promptForNewS3BucketResponses.length <= 0) {
            throw new Error('promptUserForS3BucketName was called more times than expected')
        }

        return this.promptForNewS3BucketResponses.pop()
    }

    public async promptUserForEcrRepo(
        step: number,
        selectedRegion?: string,
        initialValue?: EcrRepository
    ): Promise<EcrRepository | undefined> {
        if (this.promptForEcrRepoResponses.length <= 0) {
            throw new Error('promptUserForS3Bucket was called more times than expected')
        }

        return this.promptForEcrRepoResponses.pop()
    }

    public async promptUserForRegion(step: number, initialValue?: string): Promise<string | undefined> {
        if (this.promptForRegionResponses.length <= 0) {
            throw new Error('promptUserForRegion was called more times than expected')
        }

        const response = this.promptForRegionResponses.pop()
        if (!response) {
            return undefined
        }

        return response.detail
    }

    public async promptUserForStackName({
        validateInput,
    }: {
        validateInput(value: string): string | undefined
    }): Promise<string | undefined> {
        if (this.promptForStackNameResponses.length <= 0) {
            throw new Error('promptUserForStackName was called more times than expected')
        }

        const response = this.promptForStackNameResponses.pop()

        if (response && validateInput) {
            const validationResult = validateInput(response)
            if (validationResult) {
                throw new Error(`Validation error: ${validationResult}`)
            }
        }

        return response
    }
}

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('SamDeployWizard', async function () {
    let extContext: ExtContext
    before(async function () {
        extContext = await FakeExtensionContext.getFakeExtContext()
    })

    describe('TEMPLATE', async function () {
        it('fails gracefully when no templates are found', async function () {
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(extContext, [[]], [undefined], [], []))
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('exits wizard when cancelled', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [undefined],
                    [],
                    []
                )
            )
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('skips template picker if passed as argument', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const arg = vscode.Uri.file('/path/to/template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file('/wrong/template.yaml'))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                ),
                arg
            )
            const result = await wizard.run()
            assert.deepStrictEqual(result?.template, arg)
        })

        it('uses user response as template', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath)
        })
    })

    describe('PARAMETER_OVERRIDES', async function () {
        async function makeFakeContext({
            getParameters,
            getOverriddenParameters,
            promptUserForParametersIfApplicable,
            templatePath = path.join('my', 'template'),
            region = 'us-east-1',
            s3Bucket = 'mys3bucket',
            stackName = 'mystackname',
            hasImages = false,
        }: Pick<
            SamDeployWizardContext,
            'getParameters' | 'getOverriddenParameters' | 'promptUserForParametersIfApplicable'
        > & {
            templatePath?: string
            region?: string
            s3Bucket?: string
            stackName?: string
            hasImages?: boolean
        }): Promise<SamDeployWizardContext> {
            return {
                extContext: await FakeExtensionContext.getFakeExtContext(),
                // It's fine to return an empty list if promptUserForSamTemplate is overridden.
                additionalSteps: 0,
                workspaceFolders: [],

                getParameters,
                getOverriddenParameters,
                promptUserForParametersIfApplicable,
                promptUserForSamTemplate: async () => vscode.Uri.file(templatePath),
                promptUserForRegion: async () => region,
                promptUserForS3Bucket: async () => s3Bucket,
                promptUserForS3BucketName: async () => undefined,
                promptUserForEcrRepo: async () => undefined,
                promptUserForStackName: async () => stackName,
                determineIfTemplateHasImages: async () => hasImages,
            }
        }

        describe('SAM template has no parameters', async function () {
            it('skips configuring overrides and continues wizard', async function () {
                const context = await makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([]),
                    getOverriddenParameters: async () => {
                        throw new Error('Should skip loading overrides')
                    },
                    promptUserForParametersIfApplicable: async () => {
                        throw new Error('Should skip configuring overrides')
                    },
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 0)
            })
        })

        describe('SAM template has only optional parameters', async function () {
            it('skips configuring overrides and continues wizard if parameterOverrides is defined', async function () {
                const context = await makeFakeContext({
                    getParameters: async () =>
                        new Map<string, { required: boolean }>([['myParam', { required: false }]]),
                    getOverriddenParameters: async () => new Map<string, string>(),
                    promptUserForParametersIfApplicable: async () => {
                        throw new Error('Should skip configuring overrides')
                    },
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 0)
            })

            it('skips configuring overrides and continues wizard if parameterOverrides is undefined and user declines prompt', async function () {
                const context = await makeFakeContext({
                    getParameters: async () =>
                        new Map<string, { required: boolean }>([['myParam', { required: false }]]),
                    getOverriddenParameters: async () => undefined,
                    promptUserForParametersIfApplicable: async () => ParameterPromptResult.Continue,
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 0)
            })

            it('configures overrides and cancels wizard if parameterOverrides is undefined and user accepts prompt', async function () {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = await makeFakeContext({
                    getParameters: async () =>
                        new Map<string, { required: boolean }>([['myParam', { required: false }]]),
                    getOverriddenParameters: async () => undefined,
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.strictEqual(result, undefined)
                assert.strictEqual(configureParameterOverridesArgs.length, 1)
                assert.strictEqual(configureParameterOverridesArgs[0].missingParameters, undefined)
            })
        })

        describe('SAM template has required parameters', async function () {
            it('configures overrides and cancels wizard if overrides are not defined', async function () {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = await makeFakeContext({
                    getParameters: async () =>
                        new Map<string, { required: boolean }>([['myParam', { required: true }]]),
                    getOverriddenParameters: async () => undefined,
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.strictEqual(result, undefined)
                assert.strictEqual(configureParameterOverridesArgs.length, 1)
                assert.ok(configureParameterOverridesArgs[0].missingParameters)
                assert.strictEqual(configureParameterOverridesArgs[0].missingParameters!.has('myParam'), true)
            })

            it('configures overrides and cancels wizard if there are missing overrides', async function () {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = await makeFakeContext({
                    getParameters: async () =>
                        new Map<string, { required: boolean }>([['myParam', { required: true }]]),
                    getOverriddenParameters: async () => new Map<string, string>(),
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.strictEqual(result, undefined)
                assert.strictEqual(configureParameterOverridesArgs.length, 1)
                assert.ok(configureParameterOverridesArgs[0].missingParameters)
                assert.strictEqual(configureParameterOverridesArgs[0].missingParameters!.has('myParam'), true)
            })

            it('stores existing overrides and continues without configuring overrides if there are no missing overrides', async function () {
                const configureParameterOverridesArgs: {
                    templateUri: vscode.Uri
                    missingParameters?: Set<string> | undefined
                }[] = []

                const context = await makeFakeContext({
                    getParameters: async () =>
                        new Map<string, { required: boolean }>([['myParam', { required: true }]]),
                    getOverriddenParameters: async () => new Map<string, string>([['myParam', 'myValue']]),
                    async promptUserForParametersIfApplicable(options): Promise<ParameterPromptResult> {
                        configureParameterOverridesArgs.push(options)

                        return ParameterPromptResult.Cancel
                    },
                })

                const wizard = new SamDeployWizard(context)
                const result = await wizard.run()

                assert.ok(result)
                assert.strictEqual(result!.parameterOverrides.size, 1)
                assert.strictEqual(result!.parameterOverrides.has('myParam'), true)
                assert.strictEqual(result!.parameterOverrides.get('myParam'), 'myValue')
                assert.strictEqual(configureParameterOverridesArgs.length, 0)
            })
        })
    })

    describe('REGION', async function () {
        it('uses user response for region', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder', '1')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const region = 'us-east-1'

            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem(region)],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.region, region)
        })

        it('goes back when cancelled', async function () {
            const workspaceFolderPath1 = normalizePath('my', 'workspace', 'folder', '1')
            const workspaceFolderPath2 = normalizePath('my', 'workspace', 'folder', '2')
            const templatePath1 = normalizePath(workspaceFolderPath1, 'template.yaml')
            const templatePath2 = normalizePath(workspaceFolderPath2, 'template.yaml')
            const region = 'us-east-1'

            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath1)], [vscode.Uri.file(workspaceFolderPath2)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath1)),
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath2)),
                    ],
                    [
                        undefined, // First time we ask about the S3 Bucket, cancel back to the template step
                        createQuickPickRegionResponseItem(region),
                    ],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath2)
        })
    })

    describe('S3_BUCKET', async function () {
        it('goes back when cancelled', async function () {
            const workspaceFolderPath1 = normalizePath('my', 'workspace', 'folder', '1')
            const workspaceFolderPath2 = normalizePath('my', 'workspace', 'folder', '2')
            const templatePath1 = normalizePath(workspaceFolderPath1, 'template.yaml')
            const templatePath2 = normalizePath(workspaceFolderPath2, 'template.yaml')
            const region1 = 'us-east-1'
            const region2 = 'us-east-2'

            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath1)], [vscode.Uri.file(workspaceFolderPath2)]],
                    [
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath1)),
                        createQuickPickUriResponseItem(vscode.Uri.file(templatePath2)),
                    ],
                    [createQuickPickRegionResponseItem(region1), createQuickPickRegionResponseItem(region2)],
                    [
                        undefined, // First time we ask about the S3 Bucket, cancel back to the region step
                        'mys3bucketname',
                    ],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath1)
            assert.strictEqual(result!.region, region2)
        })

        it('uses user response as s3Bucket', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname')
        })
    })

    describe('ECR_REPO', async function () {
        it('goes back when cancelled', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')

            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname', 'mys3bucketname'],
                    [],
                    // go back the first time
                    [undefined, { repositoryUri: 'uri', repositoryName: 'name', repositoryArn: 'arn' }],
                    ['myStackName'],
                    true
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result?.ecrRepo?.repositoryUri, 'uri')
        })

        it('uses user response as repo', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname'],
                    [],
                    [{ repositoryUri: 'uri', repositoryName: 'name', repositoryArn: 'arn' }],
                    ['myStackName'],
                    true
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result?.ecrRepo?.repositoryUri, 'uri')
        })
    })

    describe('STACK_NAME', async function () {
        it('goes back when cancelled', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname1', 'mys3bucketname2'],
                    [],
                    [],
                    [undefined, 'myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname2')
        })

        it('uses user response as stackName', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                    [createQuickPickRegionResponseItem('asdf')],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.stackName, 'myStackName')
        })

        describe('validation', async function () {
            async function assertValidationFails(stackName: string | undefined): Promise<void> {
                const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
                const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')

                try {
                    await new SamDeployWizard(
                        new MockSamDeployWizardContext(
                            extContext,
                            [[vscode.Uri.file(workspaceFolderPath)]],
                            [createQuickPickUriResponseItem(vscode.Uri.file(templatePath))],
                            [createQuickPickRegionResponseItem('asdf')],
                            ['myBucketName'],
                            [],
                            [],
                            [stackName]
                        )
                    ).run()
                } catch (err) {
                    return
                }

                assert.fail(`Expected validation for stack name '${stackName}' to fail, but it passed.`)
            }

            it('validates that stackName does not contain invalid charcters', async function () {
                await assertValidationFails('ab_c')
                await assertValidationFails('ab$c')
                await assertValidationFails('ab.c')
            })

            it('validates that stackName begins with an alphabetic character', async function () {
                await assertValidationFails('1abc')
                await assertValidationFails('-abc')
            })

            it('validates that stackName is not longer than 128 characters', async function () {
                const parts = []
                for (let i = 0; i < 129; i++) {
                    parts.push('a')
                }

                await assertValidationFails(parts.join(''))
            })
        })
    })
})

describe('DefaultSamDeployWizardContext', async function () {
    let context: DefaultSamDeployWizardContext
    let sandbox: sinon.SinonSandbox

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        context = new DefaultSamDeployWizardContext(await FakeExtensionContext.getFakeExtContext())
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('promptUserForS3Bucket', async function () {
        it('returns an s3 bucket name', async function () {
            const bucketName = 'strictlyForBuckets'
            sandbox
                .stub(picker, 'promptUser')
                .onFirstCall()
                .returns(Promise.resolve([{ label: bucketName }]))
            const output = await context.promptUserForS3Bucket(1, 'us-weast-1', 'accountId')
            assert.strictEqual(output, bucketName)
        })

        it('returns undefined on receiving undefined from the picker (back button)', async function () {
            sandbox.stub(picker, 'promptUser').onFirstCall().returns(Promise.resolve(undefined))
            const output = await context.promptUserForS3Bucket(1, 'us-weast-1', 'accountId')
            assert.strictEqual(output, undefined)
        })

        it('returns undefined if the user selects a no items/error message', async function () {
            const messages = {
                noBuckets: "NO! We're out of bear claws",
                bucketError: 'One box of one dozen, starving, crazed weasels',
            }
            sandbox
                .stub(picker, 'promptUser')
                .onFirstCall()
                .returns(Promise.resolve([{ label: messages.noBuckets }]))
                .onSecondCall()
                .returns(Promise.resolve([{ label: messages.bucketError }]))
            const firstOutput = await context.promptUserForS3Bucket(
                1,
                'us-weast-1',
                'profile',
                'accountId',
                undefined,
                messages
            )
            assert.strictEqual(firstOutput, undefined)

            const secondOutput = await context.promptUserForS3Bucket(
                1,
                'us-weast-1',
                'profile',
                'accountId',
                undefined,
                messages
            )
            assert.strictEqual(secondOutput, undefined)
        })
    })

    describe('promptUserForEcrRepo', async function () {
        it('returns an ECR Repo', async function () {
            const repoName = 'repo'
            sandbox
                .stub(picker, 'promptUser')
                .onFirstCall()
                .returns(Promise.resolve([{ label: repoName, repository: { repositoryUri: 'uri' } }]))
            const output = await context.promptUserForEcrRepo(1, 'us-weast-1')
            assert.notStrictEqual(output, { repositoryUri: 'uri' })
        })

        it('returns undefined on receiving undefined from the picker (back button)', async function () {
            sandbox.stub(picker, 'promptUser').onFirstCall().returns(Promise.resolve(undefined))
            const output = await context.promptUserForEcrRepo(1, 'us-weast-1')
            assert.strictEqual(output, undefined)
        })
    })

    describe('promptUserForNewS3Bucket', async function () {
        it('returns an S3 bucket name', async function () {
            const bucketName = 'shinyNewBucket'
            sandbox.stub(input, 'promptUser').onFirstCall().returns(Promise.resolve(bucketName))
            const output = await context.promptUserForS3BucketName(1, { title: 'asdf' })
            assert.strictEqual(output, bucketName)
        })

        it('returns undefined if nothing is entered', async function () {
            sandbox.stub(input, 'promptUser').onFirstCall().returns(Promise.resolve(undefined))
            const output = await context.promptUserForS3BucketName(1, { title: 'asdf' })
            assert.strictEqual(output, undefined)
        })
    })
})
