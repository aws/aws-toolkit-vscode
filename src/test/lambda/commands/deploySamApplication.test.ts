/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    deploySamApplication,
    SamDeployWizardResponseProvider,
    WindowFunctions
} from '../../../lambda/commands/deploySamApplication'
import { SamDeployWizardResponse } from '../../../lambda/wizards/samDeployWizard'
import { AwsContext } from '../../../shared/awsContext'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SamCliContext } from '../../../shared/sam/cli/samCliContext'
import { SamCliProcessInvoker } from '../../../shared/sam/cli/samCliInvokerUtils'
import {
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation
} from '../../../shared/sam/cli/samCliValidator'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'
import { getTestLogger } from '../../globalSetup.test'
import { FakeChannelLogger } from '../../shared/fakeChannelLogger'
import { FakeChildProcessResult, TestSamCliProcessInvoker } from '../../shared/sam/cli/testSamCliProcessInvoker'

describe('deploySamApplication', async () => {
    // Bad Validator

    const badValidatorResult: SamCliValidatorResult = {
        samCliFound: false
    }

    const badValidator: SamCliValidator = {
        detectValidSamCli: async (): Promise<SamCliValidatorResult> => badValidatorResult
    }

    // Bad Invoker

    const badSamCliProcessInvoker = ({} as any) as SamCliProcessInvoker

    const invalidSamCliContext: SamCliContext = {
        invoker: badSamCliProcessInvoker,
        validator: badValidator
    }

    // Good Validator

    const goodValidatorResult: SamCliValidatorResult = {
        samCliFound: true,
        versionValidation: {
            validation: SamCliVersionValidation.Valid
        }
    }

    const goodValidator: SamCliValidator = {
        detectValidSamCli: async (): Promise<SamCliValidatorResult> => goodValidatorResult
    }

    // Good Invoker

    let invokerCalledCount: number
    let goodSamCliProcessInvoker = new TestSamCliProcessInvoker(
        (spawnOptions, args: any[]): ChildProcessResult => {
            invokerCalledCount++

            return new FakeChildProcessResult({})
        }
    )

    const goodSamCliContext = (): SamCliContext => {
        return {
            invoker: goodSamCliProcessInvoker,
            validator: goodValidator
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
        showInformationMessage: showMessage
    }

    // Other support stubs
    const placeholderCredentials = ({} as any) as AWS.Credentials
    let testCredentials: AWS.Credentials | undefined
    const awsContext: Pick<AwsContext, 'getCredentials'> = {
        getCredentials: async () => testCredentials
    }

    let channelLogger: FakeChannelLogger

    let samDeployWizardResponse: SamDeployWizardResponse | undefined
    const samDeployWizard: SamDeployWizardResponseProvider = {
        getSamDeployWizardResponse: async (): Promise<SamDeployWizardResponse | undefined> => {
            return samDeployWizardResponse
        }
    }

    let tempToolkitFolder: string
    beforeEach(async () => {
        channelLogger = new FakeChannelLogger()

        tempToolkitFolder = await makeTemporaryToolkitFolder()
        const templatePath = path.join(tempToolkitFolder, 'template.yaml')
        writeFile(templatePath)

        testCredentials = placeholderCredentials
        invokerCalledCount = 0
        samDeployWizardResponse = {
            parameterOverrides: new Map<string, string>(),
            region: 'region',
            s3Bucket: 'bucket',
            stackName: 'stack',
            template: vscode.Uri.file(templatePath)
        }

        runningDeployProcess = undefined
    })

    afterEach(async () => {
        await del([tempToolkitFolder], { force: true })
    })

    it('deploys with the happy path', async () => {
        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
    })

    it('informs user of error when user is not logged in', async () => {
        testCredentials = undefined

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        assertGeneralErrorLogged(channelLogger)
    })

    it('informs user of error when sam cli is invalid', async () => {
        await deploySamApplication(
            {
                samCliContext: invalidSamCliContext,
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        assertGeneralErrorLogged(channelLogger)
    })

    it('exits if the wizard is cancelled', async () => {
        samDeployWizardResponse = undefined

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        assert.strictEqual(invokerCalledCount, 0, 'Did not expect sam cli to get invoked')
    })

    it('informs user of error if invoking sam build fails', async () => {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => {
                invokerCalledCount++

                const isDeployInvoke = args.some(arg => arg === 'build')

                return new FakeChildProcessResult({
                    exitCode: isDeployInvoke ? -1 : 0,
                    error: isDeployInvoke ? new Error('broken build') : undefined
                })
            }
        )

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 1, 'Unexpected sam cli invoke count')
        assertErrorLogsContain('broken build', false)
        assertGeneralErrorLogged(channelLogger)
    })

    it('informs user of error if invoking sam package fails', async () => {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => {
                invokerCalledCount++

                const isDeployInvoke = args.some(arg => arg === 'package')

                return new FakeChildProcessResult({
                    exitCode: isDeployInvoke ? -1 : 0,
                    error: isDeployInvoke ? new Error('broken package') : undefined
                })
            }
        )

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 2, 'Unexpected sam cli invoke count')
        assertErrorLogsContain('broken package', false)
        assertGeneralErrorLogged(channelLogger)
    })

    it('informs user of error if invoking sam deploy fails', async () => {
        goodSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => {
                invokerCalledCount++

                const isDeployInvoke = args.some(arg => arg === 'deploy')

                return new FakeChildProcessResult({
                    exitCode: isDeployInvoke ? -1 : 0,
                    error: isDeployInvoke ? new Error('broken deploy') : undefined
                })
            }
        )

        await deploySamApplication(
            {
                samCliContext: goodSamCliContext(),
                channelLogger,
                samDeployWizard
            },
            {
                awsContext,
                window
            }
        )

        await waitForDeployToComplete()
        assert.strictEqual(invokerCalledCount, 3, 'Unexpected sam cli invoke count')
        assertErrorLogsContain('broken deploy', false)
        assertGeneralErrorLogged(channelLogger)
    })

    async function waitForDeployToComplete(): Promise<void> {
        assert.ok(runningDeployProcess)
        await runningDeployProcess
    }
})

function assertGeneralErrorLogged(channelLogger: FakeChannelLogger) {
    assert.ok(
        channelLogger.loggedErrorKeys.has('AWS.samcli.deploy.general.error'),
        'Expected the deploy general error to be reported'
    )
}

function assertErrorLogsContain(text: string, exactMatch: boolean) {
    assert.ok(
        getTestLogger()
            .getLoggedEntries('error')
            .some(e => e instanceof Error && (exactMatch ? e.message === text : e.message.indexOf(text) !== -1)),
        `Expected to find ${text} in the error logs`
    )
}

function writeFile(filename: string): void {
    fs.writeFileSync(filename, '')
}
