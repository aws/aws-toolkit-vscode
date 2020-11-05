/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as fsUtils from '../../../shared/filesystemUtilities'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from '../../../shared/sam/cli/samCliBuild'
import * as localLambdaRunner from '../../../shared/sam/localLambdaRunner'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { FakeChannelLogger } from '../fakeChannelLogger'
import { assertRejects } from '../utilities/assertUtils'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/awsSamDebugger'

describe('localLambdaRunner', async () => {
    let tempDir: string
    before(async () => {
        await FakeExtensionContext.getNew()
    })

    beforeEach(async () => {
        tempDir = await fsUtils.makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        await fs.remove(tempDir)
    })

    describe('attachDebugger', async () => {
        let actualRetries: number = 0
        let channelLogger: FakeChannelLogger

        beforeEach(async () => {
            actualRetries = 0
            channelLogger = new FakeChannelLogger()
        })

        async function onWillRetry(): Promise<void> {
            actualRetries++
        }

        async function startDebuggingReturnsTrue(
            folder: vscode.WorkspaceFolder | undefined,
            nameOrConfiguration: string | vscode.DebugConfiguration
        ): Promise<boolean> {
            return Promise.resolve(true)
        }

        async function startDebuggingReturnsFalse(
            folder: vscode.WorkspaceFolder | undefined,
            nameOrConfiguration: string | vscode.DebugConfiguration
        ): Promise<boolean> {
            return Promise.resolve(false)
        }

        async function startDebuggingReturnsUndefined(
            folder: vscode.WorkspaceFolder | undefined,
            nameOrConfiguration: string | vscode.DebugConfiguration
        ): Promise<boolean> {
            const result: boolean | undefined = undefined

            return Promise.resolve(result!)
        }

        it('Successful attach has no retries', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, 0, 'Did not expect any retries when attaching debugger succeeds')
        })

        it('Successful attach logs that the debugger attached', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.ok(
                channelLogger.loggedInfoKeys.has('AWS.output.sam.local.attach.success'),
                'Expected an attach success message to be logged'
            )
        })

        it('Successful attach records a success metric', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
                onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number) => {
                    assert.ok(attachResult, 'Expected to be logging an attach success metric')
                    assert.strictEqual(attempts, 1, 'Unexpected Attempt count')
                },
            })
        })

        it('Successful attach returns success', async () => {
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.ok(results.success, 'Expected attach results to be successful')
        })

        it('Failure to attach has no retries', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, 0, 'Did not expect any retries when attaching debugger fails')
        })

        it('Failure to attach logs that the debugger did not attach', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            assert.ok(
                channelLogger.loggedErrorKeys.has('AWS.output.sam.local.attach.failure'),
                'Expected an attach failed message to be logged'
            )
        })

        it('Failure to attach records a fail metric', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
                onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number) => {
                    assert.strictEqual(attachResult, false, 'Expected to be logging an attach failure metric')
                },
            })
        })

        it('Failure to attach returns failure', async () => {
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            assert.strictEqual(results.success, false, 'Expected attach results to fail')
        })

        it('Attempts to retry when startDebugging returns undefined', async () => {
            const maxRetries: number = 3

            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: maxRetries,
                onStartDebugging: startDebuggingReturnsUndefined,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, maxRetries, 'Unexpected Retry count')
        })

        it('Logs about exceeding the retry limit', async () => {
            const maxRetries: number = 3

            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries,
                onStartDebugging: startDebuggingReturnsUndefined,
                onWillRetry,
            })

            assert.ok(
                channelLogger.loggedErrorKeys.has('AWS.output.sam.local.attach.retry.limit.exceeded'),
                'Expected a retry limit exceeded message to be logged'
            )
        })

        it('Does not log metrics when startDebugging returns undefined', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries: 2,
                onStartDebugging: startDebuggingReturnsUndefined,
                onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number): void => {
                    assert.strictEqual(actualRetries, 2, 'Metrics should only be recorded once')
                    assert.notStrictEqual(attachResult, undefined, 'attachResult should not be undefined')
                },
                onWillRetry,
            })
        })

        it('Returns true if attach succeeds during retries', async () => {
            const maxRetries: number = 5
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries,
                onStartDebugging: async (
                    folder: vscode.WorkspaceFolder | undefined,
                    nameOrConfiguration: string | vscode.DebugConfiguration
                ): Promise<boolean> => {
                    const retVal = actualRetries === maxRetries - 2 ? true : undefined

                    return retVal!
                },
                onWillRetry,
            })

            assert.ok(results.success, 'Expected attach results to succeed')
        })

        it('Returns false if attach fails during retries', async () => {
            const maxRetries: number = 5
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries,
                onStartDebugging: async (
                    folder: vscode.WorkspaceFolder | undefined,
                    nameOrConfiguration: string | vscode.DebugConfiguration
                ): Promise<boolean> => {
                    const retVal = actualRetries === maxRetries - 2 ? false : undefined

                    return retVal!
                },
                onWillRetry,
            })

            assert.strictEqual(results.success, false, 'Expected attach results to fail')
        })

        it('Returns false if retry count exceeded', async () => {
            const maxRetries: number = 3
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                channelLogger,
                maxRetries,
                onStartDebugging: startDebuggingReturnsUndefined,
                onWillRetry,
            })

            assert.strictEqual(results.success, false, 'Expected attach results to fail')
        })
    })

    describe('executeSamBuild', () => {
        const failedChildProcess: ChildProcessResult = {
            exitCode: 1,
            error: new Error('you are already dead'),
            stdout: 'friendly failure message',
            stderr: 'big ugly failure message',
        }

        const successfulChildProcess: ChildProcessResult = {
            exitCode: 0,
            error: undefined,
            stdout: 'everything sunny all the time always',
            stderr: 'nothing to report',
        }

        function generateSamBuildParams(isSuccessfulBuild: boolean): SamCliBuildInvocationArguments {
            return {
                buildDir: tempDir,
                baseDir: tempDir,
                templatePath: tempDir,
                manifestPath: undefined, // not needed for testing
                invoker: {
                    invoke: async (): Promise<ChildProcessResult> =>
                        isSuccessfulBuild ? successfulChildProcess : failedChildProcess,
                },
                environmentVariables: undefined,
                useContainer: false,
                skipPullImage: true,
            }
        }

        it('fails when the child process returns a nonzero exit code', async () => {
            const samArgs = generateSamBuildParams(false)
            await assertRejects(async () => await new SamCliBuildInvocation(samArgs).execute())
        })

        it('succeeds when the child process returns with an exit code of 0', async () => {
            const samArgs = generateSamBuildParams(true)
            assert.strictEqual(await new SamCliBuildInvocation(samArgs).execute(), 0)
        })
    })
})
