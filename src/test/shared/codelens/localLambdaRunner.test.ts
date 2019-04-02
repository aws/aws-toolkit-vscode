/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { DebugConfiguration } from '../../../lambda/local/debugConfiguration'
import * as localLambdaRunner from '../../../shared/codelens/localLambdaRunner'
import { BasicLogger, ErrorOrString } from '../../../shared/logger'
import { ChannelLogger } from '../../../shared/utilities/vsCodeUtils'

class FakeChannelLogger implements Pick<ChannelLogger, 'info' | 'error' | 'logger'> {
    public readonly loggedInfoKeys: Set<string> = new Set<string>()
    public readonly loggedErrorKeys: Set<string> = new Set<string>()
    public readonly logger: FakeBasicLogger = new FakeBasicLogger()

    public info(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedInfoKeys.add(nlsKey)
    }

    public error(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedErrorKeys.add(nlsKey)
    }
}

class FakeBasicLogger implements BasicLogger {
    public readonly loggedDebugEntries: ErrorOrString[] = []

    public debug(...message: ErrorOrString[]): void {
        this.loggedDebugEntries.push(...message)
    }

    public verbose(...message: ErrorOrString[]): void {
        throw new Error('verbose() not used')
    }

    public info(...message: ErrorOrString[]): void {
        throw new Error('info() not used')
    }

    public warn(...message: ErrorOrString[]): void {
        throw new Error('warn() not used')
    }

    public error(...message: ErrorOrString[]): void {
        throw new Error('error() not used')
    }
}

describe('LocalLambdaRunner', async () => {
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
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, 0, 'Did not expect any retries when attaching debugger succeeds')
        })

        it('Successful attach logs that the debugger attached', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
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
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
                onRecordAttachDebuggerMetric: (
                    attachResult: boolean | undefined,
                    attempts: number,
                    attachResultDate: Date
                ) => {
                    assert.ok(attachResult, 'Expected to be logging an attach success metric')
                    assert.strictEqual(attempts, 1, 'Unexpected Attempt count')
                }
            })
        })

        it('Successful attach returns success', async () => {
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
                onStartDebugging: startDebuggingReturnsTrue,
                onWillRetry,
            })

            assert.ok(
                results.success,
                'Expected attach results to be successful'
            )
        })

        it('Failure to attach has no retries', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, 0, 'Did not expect any retries when attaching debugger fails')
        })

        it('Failure to attach logs that the debugger did not attach', async () => {
            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
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
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
                onRecordAttachDebuggerMetric: (
                    attachResult: boolean | undefined,
                    attempts: number,
                    attachResultDate: Date
                ) => {
                    assert.strictEqual(attachResult, false, 'Expected to be logging an attach failure metric')
                }
            })
        })

        it('Failure to attach returns failure', async () => {
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 0,
                onStartDebugging: startDebuggingReturnsFalse,
                onWillRetry,
            })

            assert.strictEqual(
                results.success,
                false,
                'Expected attach results to fail'
            )
        })

        it('Attempts to retry when startDebugging returns undefined', async () => {
            const maxAttempts: number = 3

            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts,
                onStartDebugging: startDebuggingReturnsUndefined,
                onWillRetry,
            })

            assert.strictEqual(actualRetries, maxAttempts - 1, 'Unexpected Retry count')
        })

        it('Logs about exceeding the attempt limit', async () => {
            const maxAttempts: number = 3

            await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts,
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
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts: 2,
                onStartDebugging: startDebuggingReturnsUndefined,
                onRecordAttachDebuggerMetric: (
                    attachResult: boolean | undefined, attempts: number
                ): void => {
                    assert.strictEqual(actualRetries, 1, 'Metrics should only be recorded once')
                    assert.notStrictEqual(attachResult, undefined, 'attachResult should not be undefined')
                },
                onWillRetry,
            })
        })

        it('Returns true if attach succeeds during retries', async () => {
            const maxAttempts: number = 5
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts,
                onStartDebugging: async (
                    folder: vscode.WorkspaceFolder | undefined,
                    nameOrConfiguration: string | vscode.DebugConfiguration
                ): Promise<boolean> => {
                    const retVal = actualRetries === maxAttempts - 2 ? true : undefined

                    return retVal!
                },
                onWillRetry,
            })

            assert.ok(
                results.success,
                'Expected attach results to succeed'
            )
        })

        it('Returns false if attach fails during retries', async () => {
            const maxAttempts: number = 5
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts,
                onStartDebugging: async (
                    folder: vscode.WorkspaceFolder | undefined,
                    nameOrConfiguration: string | vscode.DebugConfiguration
                ): Promise<boolean> => {
                    const retVal = actualRetries === maxAttempts - 2 ? false : undefined

                    return retVal!
                },
                onWillRetry,
            })

            assert.strictEqual(
                results.success,
                false,
                'Expected attach results to fail'
            )
        })

        it('Returns false if attempt count exceeded', async () => {
            const maxAttempts: number = 3
            const results = await localLambdaRunner.attachDebugger({
                debugConfig: {} as any as DebugConfiguration,
                channelLogger,
                maxAttempts,
                onStartDebugging: startDebuggingReturnsUndefined,
                onWillRetry,
            })

            assert.strictEqual(
                results.success,
                false,
                'Expected attach results to fail'
            )
        })
    })
})
