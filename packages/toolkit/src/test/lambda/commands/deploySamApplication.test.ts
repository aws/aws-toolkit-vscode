/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import globals from '../../../shared/extensionGlobals'
import * as vscode from 'vscode'
import { deploySamApplication, WindowFunctions } from '../../../lambda/commands/deploySamApplication'
import { SamDeployWizardResponse } from '../../../lambda/wizards/samDeployWizard'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SamCliContext } from '../../../shared/sam/cli/samCliContext'
import { SamCliProcessInvoker } from '../../../shared/sam/cli/samCliInvokerUtils'
import {
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../../../shared/sam/cli/samCliValidator'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'
import { assertLogsContain, getTestLogger } from '../../globalSetup.test'
import { FakeChildProcessResult, TestSamCliProcessInvoker } from '../../shared/sam/cli/testSamCliProcessInvoker'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import { Settings } from '../../../shared/settings'
import { SamCliSettings } from '../../../shared/sam/cli/samCliSettings'
import { FakeAwsContext } from '../../utilities/fakeAwsContext'

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
            version: '',
            validation: SamCliVersionValidation.Valid,
        },
    }

    const goodValidator: SamCliValidator = {
        detectValidSamCli: async (): Promise<SamCliValidatorResult> => goodValidatorResult,
        getVersionValidatorResult: async (): Promise<SamCliVersionValidatorResult> => {
            return { validation: SamCliVersionValidation.Valid, version: '' }
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
    let settings: Settings
    let config: SamCliSettings
    let templatePath: string
    let tempToolkitFolder: string
    let samDeployWizardResponse: SamDeployWizardResponse | undefined
    const samDeployWizard = async (): Promise<SamDeployWizardResponse | undefined> => {
        return samDeployWizardResponse
    }

    const awsContext = new FakeAwsContext()
    awsContext.getCredentials = async () => testCredentials
    awsContext.getCredentialProfileName = () => profile

    // Fake "aws.refreshAwsExplorer" command. 50b5a28b8e35 #1665
    let didRefreshExplorer = false
    function refreshFn() {
        didRefreshExplorer = true
    }

    beforeEach(async function () {
        didRefreshExplorer = false
        settings = new TestSettings() as any
        config = new SamCliSettings({ getLocation: async () => ({ path: '', version: '' }) }, settings)
        profile = 'testAcct'
        tempToolkitFolder = await makeTemporaryToolkitFolder()
        templatePath = path.join(tempToolkitFolder, 'template.yaml')
        writeFile(templatePath)

        // TODO: is this safe? will add output channel across all tests
        // we are using this pattern in other tests...
        globals.outputChannel = vscode.window.createOutputChannel('test channel')

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
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(config.getSavedBuckets(), {
            [profile]: { region: 'bucket' },
        })
        assert.ok(didRefreshExplorer)
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
        await settings.update('aws.samcli.manuallySelectedBuckets', JSON.stringify(testSavedBuckets))

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(config.getSavedBuckets(), { ...testSavedBuckets, [profile]: { region: 'bucket' } })
        assert.ok(didRefreshExplorer)
    })

    it('handles malformed stored buckets', async () => {
        await settings.update('aws.samcli.manuallySelectedBuckets', 'ilovebuckets')

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.deepStrictEqual(config.getSavedBuckets(), { [profile]: { region: 'bucket' } })
        assert.ok(didRefreshExplorer)
    })

    it('overwrites recently selected bucket', async () => {
        await config.updateSavedBuckets(profile, 'region', 'oldBucket')

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                samDeployWizard,
            },
            {
                awsContext,
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(config.getSavedBuckets(), { [profile]: { region: 'bucket' } })
        assert.ok(didRefreshExplorer)
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
                settings: config,
                window,
                refreshFn,
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
                settings: config,
                window,
                refreshFn,
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
                settings: config,
                window,
                refreshFn,
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
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 12, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(config.getSavedBuckets(), {
            [profile]: {
                region0: 'bucket3',
                region1: 'bucket1',
                region2: 'bucket2',
            },
        })
        assert.ok(didRefreshExplorer)
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
                settings: config,
                window,
                refreshFn,
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
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 6, 'Unexpected sam cli invoke count')
        assert.deepStrictEqual(config.getSavedBuckets(), {
            testAcct0: {
                region0: 'bucket0',
            },
            testAcct1: {
                region0: 'bucket1',
            },
        })
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
                settings: config,
                window,
                refreshFn,
            }
        )

        assertGeneralErrorLogged()
        // Deploy aborted, so this is false.
        assert.ok(!didRefreshExplorer)
    })

    it('informs user of error when sam cli is invalid', async function () {
        await deploySamApplication(
            {
                samCliContext: invalidSamCliContext,
                samDeployWizard,
            },
            {
                awsContext,
                settings: config,
                window,
                refreshFn,
            }
        )

        assertGeneralErrorLogged()
        // Deploy aborted, so this is false.
        assert.ok(!didRefreshExplorer)
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
                settings: config,
                window,
                refreshFn,
            }
        )

        assert.strictEqual(invokerCalledCount, 0, 'Did not expect sam cli to get invoked')
        // Deploy aborted, so this is false.
        assert.ok(!didRefreshExplorer)
    })

    it('continues deploying with initial template if invoking sam build fails', async function () {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            const isDeployInvoke = args.includes('build')

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
                settings: config,
                window,
                refreshFn,
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assertErrorLogsSwallowed('broken build', false)
        assert.ok(didRefreshExplorer)
    })

    it('informs user of error if invoking sam package fails', async function () {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            const isDeployInvoke = args.includes('package')

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
                settings: config,
                window,
                refreshFn,
            }
        )

        assert.strictEqual(invokerCalledCount, 2, 'Unexpected sam cli invoke count')
        assertLogsContain('broken package', false, 'error')
        assertGeneralErrorLogged()
        // Deploy aborted, so this is false.
        assert.ok(!didRefreshExplorer)
    })

    it('informs user of error if invoking sam deploy fails', async function () {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker((spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            const isDeployInvoke = args.includes('deploy')

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
                settings: config,
                window,
                refreshFn,
            }
        )

        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assertLogsContain('broken deploy', false, 'error')
        assertGeneralErrorLogged()
        assert.strictEqual(config.getSavedBuckets(), undefined)
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
