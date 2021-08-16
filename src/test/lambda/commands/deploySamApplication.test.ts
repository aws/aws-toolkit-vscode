/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { deploySamApplication, WindowFunctions } from '../../../lambda/commands/deploySamApplication'
import {
    readSavedBuckets,
    writeSavedBucket,
    SamDeployWizardResponse,
    SavedBuckets,
    CHOSEN_BUCKET_KEY,
} from '../../../lambda/wizards/samDeployWizard'
import { AwsContext } from '../../../shared/awsContext'
import { ext } from '../../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SamCliContext } from '../../../shared/sam/cli/samCliContext'
import { SamCliProcessInvoker } from '../../../shared/sam/cli/samCliInvokerUtils'
import {
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../../../shared/sam/cli/samCliValidator'
import { SettingsConfiguration } from '../../../shared/settingsConfiguration'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'
import { assertLogsContain, getTestLogger } from '../../globalSetup.test'
import { FakeChildProcessResult, TestSamCliProcessInvoker } from '../../shared/sam/cli/testSamCliProcessInvoker'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'

describe('deploySamApplication', async function () {
    // Bad Validator

    const badValidatorResult: SamCliValidatorResult = {
        samCliFound: false,
    }

    const badValidator: SamCliValidator = {
        detectValidSamCli: async (): Promise<SamCliValidatorResult> => badValidatorResult,
        getVersionValidatorResult: async (): Promise<SamCliVersionValidatorResult> => {
            return { validation: SamCliVersionValidation.VersionNotParseable }
        },
    }

    // Bad Invoker

    const badSamCliProcessInvoker = {} as any as SamCliProcessInvoker

    const invalidSamCliContext: SamCliContext = {
        invoker: badSamCliProcessInvoker,
        validator: badValidator,
    }

    // Good Validator

    const goodValidatorResult: SamCliValidatorResult = {
        samCliFound: true,
        versionValidation: {
            validation: SamCliVersionValidation.Valid,
        },
    }

    const goodValidator: SamCliValidator = {
        detectValidSamCli: async (): Promise<SamCliValidatorResult> => goodValidatorResult,
        getVersionValidatorResult: async (): Promise<SamCliVersionValidatorResult> => {
            return { validation: SamCliVersionValidation.Valid }
        },
    }

    // Good Invoker

    let invokerCalledCount: number
    let goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
        invokerCalledCount++

        return new FakeChildProcessResult({})
    })

    const goodSamCliContext = (): SamCliContext => {
        return {
            invoker: goodSamCliProcessInvoker,
            validator: goodValidator,
        }
    }

    // vscode window stubs

    function showMessage(message: string, ...items: string[]): Thenable<string | undefined>
    function showMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>
    async function showMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Promise<T | undefined> {
        return undefined
    }

    let runningDeployProcess: Thenable<any> | undefined
    function setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): vscode.Disposable {
        runningDeployProcess = hideWhenDone

        return new vscode.Disposable(() => {})
    }

    const window: WindowFunctions = {
        setStatusBarMessage,
        showErrorMessage: showMessage,
        showInformationMessage: showMessage,
    }

    // Other support stubs
    const placeholderCredentials = {} as any as AWS.Credentials
    let testCredentials: AWS.Credentials | undefined
    let profile: string = ''
    const awsContext: Pick<AwsContext, 'getCredentials' | 'getCredentialProfileName'> = {
        getCredentials: async () => testCredentials,
        getCredentialProfileName: () => profile,
    }
    let settings: SettingsConfiguration

    let samDeployWizardResponse: SamDeployWizardResponse | undefined
    const samDeployWizard = async (): Promise<SamDeployWizardResponse | undefined> => {
        return samDeployWizardResponse
    }

    let templatePath: string

    let tempToolkitFolder: string
    beforeEach(async function () {
        settings = new TestSettingsConfiguration()
        profile = 'testAcct'
        tempToolkitFolder = await makeTemporaryToolkitFolder()
        templatePath = path.join(tempToolkitFolder, 'template.yaml')
        writeFile(templatePath)

        // TODO: is this safe? will add output channel across all tests
        // we are using this pattern in other tests...
        ext.outputChannel = vscode.window.createOutputChannel('test channel')

        testCredentials = placeholderCredentials
        invokerCalledCount = 0
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region',
            s3Bucket: 'bucket',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }

        runningDeployProcess = undefined
    })

    afterEach(async function () {
        await fs.remove(tempToolkitFolder)
    })

    it('deploys with the happy path', async function () {
        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(readSavedBuckets(settings), {
            [profile]: { region: 'bucket' },
        } as SavedBuckets)
    })

    it('handles previously stored stringified buckets', async () => {
        const testSavedBuckets = {
            profile1: {
                region1: 'mybucket1',
                region2: 'mybucket2',
            },
            profile2: {
                region1: 'mybucket3',
                region3: 'mybucket4',
            },
        }
        settings.writeSetting(CHOSEN_BUCKET_KEY, JSON.stringify(testSavedBuckets), vscode.ConfigurationTarget.Global)

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(readSavedBuckets(settings), { ...testSavedBuckets, [profile]: { region: 'bucket' } })
    })

    it('handles malformed stored buckets', async () => {
        settings.writeSetting(CHOSEN_BUCKET_KEY, 'ilovebuckets', vscode.ConfigurationTarget.Global)

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.deepStrictEqual(readSavedBuckets(settings), { [profile]: { region: 'bucket' } })
    })

    it('overwrites recently selected bucket', async () => {
        writeSavedBucket(settings, profile, 'region', 'oldBucket')

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(readSavedBuckets(settings), { [profile]: { region: 'bucket' } } as SavedBuckets)
    })

    it('saves one bucket max to multiple regions', async () => {
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region0',
            s3Bucket: 'bucket0',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region1',
            s3Bucket: 'bucket1',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }
        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region2',
            s3Bucket: 'bucket2',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }
        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region0',
            s3Bucket: 'bucket3',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }
        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 12, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(readSavedBuckets(settings), {
            [profile]: {
                region0: 'bucket3',
                region1: 'bucket1',
                region2: 'bucket2',
            },
        } as SavedBuckets)
    })

    it('saves one bucket per region per profile', async () => {
        profile = 'testAcct0'
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region0',
            s3Bucket: 'bucket0',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        profile = 'testAcct1'
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region0',
            s3Bucket: 'bucket1',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath),
        }
        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 6, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(readSavedBuckets(settings), {
            testAcct0: {
                region0: 'bucket0',
            },
            testAcct1: {
                region0: 'bucket1',
            },
        } as SavedBuckets)
    })

    it('informs user of error when user is not logged in', async function () {
        testCredentials = undefined

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        assertGeneralErrorLogged()
    })

    it('informs user of error when sam cli is invalid', async function () {
        await deploySamApplication(
            {
                samCliContext: invalidSamCliContext,
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        assertGeneralErrorLogged()
    })

    it('exits if the wizard is cancelled', async function () {
        samDeployWizardResponse = undefined

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        assert.strictEqual(invokerCalledCount, 0, 'Did not expect sam cli to get invoked')
    })

    it('continues deploying with initial template if invoking sam build fails', async function () {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            const isDeployInvoke = args.some(arg => arg === 'build')

            return new FakeChildProcessResult({
                exitCode: isDeployInvoke ? -1 : 0,
                error: isDeployInvoke ? new Error('broken build') : undefined,
            })
        })

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assertErrorLogsSwallowed('broken build', false)
    })

    it('informs user of error if invoking sam package fails', async function () {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            const isDeployInvoke = args.some(arg => arg === 'package')

            return new FakeChildProcessResult({
                exitCode: isDeployInvoke ? -1 : 0,
                error: isDeployInvoke ? new Error('broken package') : undefined,
            })
        })

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        assert.strictEqual(invokerCalledCount, 2, 'Unexpected sam cli invoke count')
        assertLogsContain('broken package', false, 'error')
        assertGeneralErrorLogged()
    })

    it('informs user of error if invoking sam deploy fails', async function () {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            const isDeployInvoke = args.some(arg => arg === 'deploy')

            return new FakeChildProcessResult({
                exitCode: isDeployInvoke ? -1 : 0,
                error: isDeployInvoke ? new Error('broken deploy') : undefined,
            })
        })

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings,
                window,
            }
        )

        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assertLogsContain('broken deploy', false, 'error')
        assertGeneralErrorLogged()
        assert.strictEqual(readSavedBuckets(settings), undefined)
    })

    async function waitForDeployToComplete(): Promise<void> {
        assert.ok(runningDeployProcess)
        await runningDeployProcess
    }
})

function assertGeneralErrorLogged() {
    // match string 'AWS.samcli.deploy.general.error'
    assertLogsContain('Error deploying a SAM Application.', false, 'error')
}

function assertErrorLogsSwallowed(text: string, exactMatch: boolean) {
    assert.ok(
        getTestLogger()
            .getLoggedEntries('error')
            .some(e => !(e instanceof Error) && (exactMatch ? e === text : e.includes(text))),
        `Expected to find "${text}" in the error logs, but not as a thrown error`
    )
}

function writeFile(filename: string): void {
    fs.writeFileSync(filename, '')
}
