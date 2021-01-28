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
import { assertRejects } from '../utilities/assertUtils'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/awsSamDebugger'
import { assertLogsContain } from '../../globalSetup.test'

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

        beforeEach(async () => {
            actualRetries = 0
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

        it('Successful attach has no retries', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, 0, 'Did not expect any retries when attaching debugger succeeds')
        })

        it('Successful attach logs that the debugger attached', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            // match string 'AWS.output.sam.local.attach.success'
            assertLogsContain('Debugger attached', false, 'info')
        })

        it('Successful attach records a success metric', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
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
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.ok(results.success, 'Expected attach results to be successful')
        })

        it('Failure to attach logs that the debugger did not attach', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            // match string 'AWS.output.sam.local.attach.failure'
            assertLogsContain('Unable to attach Debugger', false, 'error')
        })

        it('Failure to attach records a fail metric', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
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
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            assert.strictEqual(results.success, false, 'Expected attach results to fail')
        })

        it('Logs about exceeding the retry limit', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            // match string 'AWS.output.sam.local.attach.retry.limit.exceeded'
            assertLogsContain('Retry limit reached', false, 'error')
        })

        it('Does not log metrics when startDebugging returns false', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsFalse,
                onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number): void => {
                    assert.strictEqual(actualRetries, 4, 'Metrics should only be recorded once')
                    assert.notStrictEqual(attachResult, undefined, 'attachResult should not be undefined')
                },
                onWillRetry,
            })
        })

        it('Returns true if attach succeeds during retries', async () => {
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: async (
                    folder: vscode.WorkspaceFolder | undefined,
                    nameOrConfiguration: string | vscode.DebugConfiguration
                ): Promise<boolean> => {
                    const retVal = actualRetries === 3 ? true : undefined

                    return retVal!
                },
                onWillRetry,
            })

            assert.ok(results.success, 'Expected attach results to succeed')
        })

        it('Returns false if retry count exceeded', async () => {
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: ({} as any) as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsFalse,
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
                    stop: () => {},
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
