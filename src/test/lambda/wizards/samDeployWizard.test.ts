/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as paramUtils from '../../../lambda/utilities/parameterUtils'
import * as input from '../../../shared/ui/input'
import { QuickPickPrompter} from '../../../shared/ui/picker'
import {
    CONFIGURE_PARAMETERS,
    SamDeployWizard,
    SamDeployWizardContext,
    DefaultSamDeployWizardContext,
    validateStackName,
} from '../../../lambda/wizards/samDeployWizard'
import { EcrRepository } from '../../../shared/clients/ecrClient'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { ExtContext } from '../../../shared/extensions'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { isValidResponse, Prompter } from '../../../shared/ui/prompter'
import { MockPrompter } from '../../shared/wizards/wizardFramework'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'
import * as config from '../../../lambda/config/configureParameterOverrides'

const imageTemplate: CloudFormation.Template = { 
    Resources: { 
        key1: { Type: 'AWS::Serverless::Function', Properties: { PackageType: 'Image' } } 
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
        private readonly promptForSamTemplateResponses: (vscode.Uri| undefined)[] = [],
        private readonly promptForRegionResponses: (string | undefined)[] = [],
        private readonly promptForS3BucketResponses: (string | undefined)[] = [],
        private readonly promptForNewS3BucketResponses: (string | undefined)[] = [],
        private readonly promptForEcrRepoResponses: (EcrRepository | undefined)[] = [],
        private readonly promptForStackNameResponses: (string | undefined)[] = [],
        private readonly isImage: boolean[] = []
    ) {
        this.workspaceFoldersResponses = workspaceFoldersResponses.reverse()
        this.promptForSamTemplateResponses = promptForSamTemplateResponses.reverse()
        this.promptForRegionResponses = promptForRegionResponses.reverse()
        this.promptForS3BucketResponses = promptForS3BucketResponses.reverse()
        this.promptForNewS3BucketResponses = promptForNewS3BucketResponses.reverse()
        this.promptForEcrRepoResponses = promptForEcrRepoResponses.reverse()
        this.promptForStackNameResponses = promptForStackNameResponses.reverse()
        this.isImage = isImage.reverse()
    }

    public createSamTemplatePrompter(): Prompter<CloudFormation.Template & { uri: vscode.Uri }> {
        if (this.promptForSamTemplateResponses.length <= 0) {
            throw new Error('promptUserForSamTemplate was called more times than expected')
        }

        const response = this.promptForSamTemplateResponses.pop()
        if (!response) {
            return new MockPrompter<CloudFormation.Template & { uri: vscode.Uri }>(WIZARD_BACK)
        }

        const isImage = this.isImage.pop() ?? false

        return new MockPrompter<CloudFormation.Template & { uri: vscode.Uri }>({ ...(isImage ? imageTemplate : {}), uri: response })
    }

    public createParametersPrompter(templateUri: vscode.Uri, missingParameters?: Set<string>): Prompter<Map<string, string>> {
        return new MockPrompter(new Map<string, string>())
    }
    public createRegionPrompter(): Prompter<string> {
        if (this.promptForRegionResponses.length <= 0) {
            throw new Error('promptUserForRegion was called more times than expected')
        }

        const response = this.promptForRegionResponses.pop()
        if (!response) {
            return new MockPrompter<string>(WIZARD_BACK)
        }

        return new MockPrompter(response)
    }
    public createS3BucketNamePrompter(title: string): Prompter<string> {
        if (this.promptForNewS3BucketResponses.length <= 0) {
            throw new Error('promptUserForS3BucketName was called more times than expected')
        }

        return new MockPrompter(this.promptForNewS3BucketResponses.pop())
    }
    public createStackNamePrompter(): Prompter<string> {
        if (this.promptForStackNameResponses.length <= 0) {
            throw new Error('promptUserForStackName was called more times than expected')
        }

        const response = this.promptForStackNameResponses.pop()

        if (response !== undefined && validateStackName(response) !== undefined) {
            throw new Error('Invalid stack name')
        }

        return new MockPrompter(response)
    }
    public createS3BucketPrompter(region: string, profile?: string, accountId?: string): Prompter<string> {
        if (this.promptForS3BucketResponses.length <= 0) {
            throw new Error('promptUserForS3Bucket was called more times than expected')
        }

        return new MockPrompter(this.promptForS3BucketResponses.pop())
    }
    public createEcrRepoPrompter(region: string): Prompter<EcrRepository> {
        if (this.promptForEcrRepoResponses.length <= 0) {
            throw new Error('promptUserForS3Bucket was called more times than expected')
        }

        return new MockPrompter(this.promptForEcrRepoResponses.pop())
    }

    public readonly getOverriddenParameters: typeof paramUtils.getOverriddenParameters = async () => undefined

    public readonly getParameters: typeof paramUtils.getParameters = async () => new Map()
}

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('SamDeployWizard', async function () {
    const extContext = await FakeExtensionContext.getFakeExtContext()
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

        it('uses user response as template', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [vscode.Uri.file(templatePath)],
                    ['asdf'],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName']
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.uri.fsPath, templatePath)
        })
    })

    describe('PARAMETER_OVERRIDES', async function () {
        sinon.stub(config, 'configureParameterOverrides')

        async function makeFakeContext({
            getParameters,
            getOverriddenParameters,
            createParametersPrompter,
            templatePath = path.join('my', 'template'),
            region = 'us-east-1',
            s3Bucket = 'mys3bucket',
            stackName = 'mystackname',
            hasImages = false,
        }: Pick<
            SamDeployWizardContext,
            'getParameters' | 'getOverriddenParameters' | 'createParametersPrompter'
        > & {
            templatePath?: string
            region?: string
            s3Bucket?: string
            stackName?: string
            hasImages?: boolean
        }): Promise<SamDeployWizardContext> {
            return {
                extContext: await FakeExtensionContext.getFakeExtContext(),
                workspaceFolders: [],

                getParameters,
                getOverriddenParameters,
                createParametersPrompter,
                createSamTemplatePrompter: () => 
                    new MockPrompter({ ...(hasImages ? imageTemplate : {}), uri: vscode.Uri.file(templatePath) }),
                createRegionPrompter: () => new MockPrompter(region),
                createS3BucketPrompter: () => new MockPrompter(s3Bucket),
                createS3BucketNamePrompter: () => new MockPrompter<string>(WIZARD_BACK),
                createEcrRepoPrompter: () => new MockPrompter<EcrRepository>(WIZARD_BACK),
                createStackNamePrompter: () => new MockPrompter(stackName),
            }
        }

        describe('SAM template has no parameters', async function () {
            it('skips configuring overrides and continues wizard', async function () {
                const context = await makeFakeContext({
                    getParameters: async () => new Map<string, { required: boolean }>([]),
                    getOverriddenParameters: async () => {
                        throw new Error('Should skip loading overrides')
                    },
                    createParametersPrompter: () => {
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
                    createParametersPrompter: () => {
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
                    createParametersPrompter: () => new MockPrompter(new Map<string, string>())
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
                    createParametersPrompter(uri, missing?): MockPrompter<Map<string, string>> {
                        configureParameterOverridesArgs.push({ templateUri: uri, missingParameters: missing })

                        return new MockPrompter(CONFIGURE_PARAMETERS)
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
                    createParametersPrompter(uri, missing?): MockPrompter<Map<string, string>> {
                        configureParameterOverridesArgs.push({ templateUri: uri, missingParameters: missing })

                        return new MockPrompter(CONFIGURE_PARAMETERS)
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
                    createParametersPrompter(uri, missing?): MockPrompter<Map<string, string>> {
                        configureParameterOverridesArgs.push({ templateUri: uri, missingParameters: missing })

                        return new MockPrompter(CONFIGURE_PARAMETERS)
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
                    createParametersPrompter(uri, missing?): MockPrompter<Map<string, string>> {
                        configureParameterOverridesArgs.push({ templateUri: uri, missingParameters: missing })

                        return new MockPrompter(new Map<string, string>())
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
                    [vscode.Uri.file(templatePath)],
                    [region],
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
                    [vscode.Uri.file(templatePath1), vscode.Uri.file(templatePath2)],
                    [
                        undefined, // First time we ask about the S3 Bucket, cancel back to the template step
                        region,
                    ],
                    ['mys3bucketname'],
                    [],
                    [],
                    ['myStackName'],
                )
            )
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.uri.fsPath, templatePath2)
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
                        vscode.Uri.file(templatePath1),
                        vscode.Uri.file(templatePath2),
                    ],
                    [region1, region2],
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
            assert.strictEqual(result!.template.uri.fsPath, templatePath1)
            assert.strictEqual(result!.region, region2)
        })

        it('uses user response as s3Bucket', async function () {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(
                new MockSamDeployWizardContext(
                    extContext,
                    [[vscode.Uri.file(workspaceFolderPath)]],
                    [vscode.Uri.file(templatePath)],
                    ['asdf'],
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
                    [vscode.Uri.file(templatePath)],
                    ['asdf'],
                    ['mys3bucketname', 'mys3bucketname'],
                    [],
                    // go back the first time
                    [undefined, { repositoryUri: 'uri', repositoryName: 'name', repositoryArn: 'arn' }],
                    ['myStackName'],
                    [true],
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
                    [vscode.Uri.file(templatePath)],
                    ['asdf'],
                    ['mys3bucketname'],
                    [],
                    [{ repositoryUri: 'uri', repositoryName: 'name', repositoryArn: 'arn' }],
                    ['myStackName'],
                    [true],
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
                    [vscode.Uri.file(templatePath)],
                    ['asdf'],
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
                    [vscode.Uri.file(templatePath)],
                    ['asdf'],
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
                            [vscode.Uri.file(templatePath)],
                            ['asdf'],
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
                .stub(QuickPickPrompter.prototype, 'prompt')
                .onFirstCall()
                .resolves(bucketName)
            const output = await context.createS3BucketPrompter('us-weast-1', 'accountId').prompt()
            assert.strictEqual(output, bucketName)
        })

        it('returns go back on receiving undefined from the picker (back button)', async function () {
            sandbox.stub(QuickPickPrompter.prototype, 'prompt').onFirstCall().resolves(WIZARD_BACK)
            const output = await context.createS3BucketPrompter('us-weast-1', 'accountId').prompt()
            assert.strictEqual(output, WIZARD_BACK)
        })

        it('returns undefined if the user selects a no items/error message', async function () {
            const messages = {
                noBuckets: "NO! We're out of bear claws",
                bucketError: 'One box of one dozen, starving, crazed weasels',
            }
            sandbox
                .stub(QuickPickPrompter.prototype, 'prompt')
                .onFirstCall()
                .resolves(WIZARD_BACK)
                .onSecondCall()
                .resolves(WIZARD_BACK)
            const firstOutput = await context.createS3BucketPrompter(
                'us-weast-1',
                'profile',
                'accountId',
                messages
            ).prompt()
            assert.strictEqual(firstOutput, WIZARD_BACK)

            const secondOutput = await context.createS3BucketPrompter(
                'us-weast-1',
                'profile',
                'accountId',
                messages
            ).prompt()
            assert.strictEqual(secondOutput, WIZARD_BACK)
        })
    })

    describe('promptUserForEcrRepo', async function () {
        it('returns an ECR Repo', async function () {
            sandbox
                .stub(QuickPickPrompter.prototype, 'prompt')
                .onFirstCall()
                .resolves({ repositoryUri: 'uri' })
            const output = await context.createEcrRepoPrompter('us-weast-1').prompt()
            assert.ok(isValidResponse(output))
            assert.strictEqual(output.repositoryUri, 'uri')
        })

        it('returns undefined on receiving undefined from the picker (back button)', async function () {
            sandbox.stub(QuickPickPrompter.prototype, 'prompt')
                .onFirstCall().resolves(WIZARD_BACK)
            const output = await context.createEcrRepoPrompter('us-weast-1').prompt()
            assert.strictEqual(output, WIZARD_BACK)
        })
    })

    describe('promptUserForNewS3Bucket', async function () {
        it('returns an S3 bucket name', async function () {
            const bucketName = 'shinyNewBucket'
            sandbox.stub(input.InputBoxPrompter.prototype, 'prompt').onFirstCall().resolves(bucketName)
            const output = await context.createS3BucketNamePrompter('asdf').prompt()
            assert.strictEqual(output, bucketName)
        })

        it('returns undefined if nothing is entered', async function() {
            sandbox.stub(input.InputBoxPrompter.prototype, 'prompt').onFirstCall().resolves(WIZARD_BACK)
            const output = await context.createS3BucketNamePrompter('asdf').prompt()
            assert.strictEqual(output, WIZARD_BACK) 
        })  
    })
})
