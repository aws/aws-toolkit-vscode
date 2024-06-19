/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as fsUtils from '../../../shared/filesystemUtilities'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from '../../../shared/sam/cli/samCliBuild'
import * as localLambdaRunner from '../../../shared/sam/localLambdaRunner'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { SamLaunchRequestArgs } from '../../../shared/sam/debugger/awsSamDebugger'
import { assertLogsContain } from '../../globalSetup.test'
import { ToolkitError } from '../../../shared/errors'

describe('localLambdaRunner', async function () {
    let tempDir: string
    before(async function () {
        await FakeExtensionContext.create()
    })

    beforeEach(async function () {
        tempDir = await fsUtils.makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(tempDir)
    })

    describe('attachDebugger', async function () {
        let actualRetries: number = 0

        beforeEach(async function () {
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

        it('Successful attach has no retries', async function () {
            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, 0, 'Did not expect any retries when attaching debugger succeeds')
        })

        it('Successful attach logs that the debugger attached', async function () {
            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            // match string 'AWS.output.sam.local.attach.success'
            assertLogsContain('Debugger attached', false, 'info')
        })

        it('Failure to attach throws an error', async function () {
            const results = localLambdaRunner.attachDebugger({
                debugConfig: {} as any as SamLaunchRequestArgs,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            await assert.rejects(results, /failed to attach debugger/i)
        })

        it('Uses a code for exceeding the retry limit', async function () {
            const results = await localLambdaRunner
                .attachDebugger({
                    debugConfig: {} as any as SamLaunchRequestArgs,
                    onStartDebugging: startDebuggingReturnsFalse,
                    onWillRetry,
                })
                .catch(e => e)

            assert.ok(results instanceof ToolkitError)
            assert.strictEqual(results.code, 'DebuggerRetryLimit')
        })

        it('Does not fail if attach succeeds during retries', async function () {
            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as SamLaunchRequestArgs,
                onStartDebugging: async (
                    folder: vscode.WorkspaceFolder | undefined,
                    nameOrConfiguration: string | vscode.DebugConfiguration
                ): Promise<boolean> => {
                    const retVal = actualRetries === 0 ? true : undefined

                    return retVal!
                },
                onWillRetry,
            })
        })
    })

    describe('executeSamBuild', function () {
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

        it('fails when the child process returns a nonzero exit code', async function () {
            const samArgs = generateSamBuildParams(false)
            await assert.rejects(new SamCliBuildInvocation(samArgs).execute())
        })

        it('succeeds when the child process returns with an exit code of 0', async function () {
            const samArgs = generateSamBuildParams(true)
            assert.strictEqual(await new SamCliBuildInvocation(samArgs).execute(), 0)
        })
    })
})
