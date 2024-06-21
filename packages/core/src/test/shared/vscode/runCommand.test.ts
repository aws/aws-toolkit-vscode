/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'

import os from 'os'
import vscode from 'vscode'
import { promises as fsPromises } from 'fs'
import * as sinon from 'sinon'
import assert from 'assert'
import { ToolkitError, UnknownError } from '../../../shared/errors'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { Commands, defaultTelemetryThrottleMs } from '../../../shared/vscode/commands2'
import { assertTelemetry, installFakeClock } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { makeTemporaryToolkitFolder } from '../../../shared'
import path from 'path'
import { SamCliError } from '../../../shared/sam/cli/samCliInvokerUtils'
import * as env from '../../../shared/vscode/env'

async function throwMe(errorOrFn?: Error | (() => Promise<never>)): Promise<void | never> {
    if (errorOrFn && !(errorOrFn instanceof Error)) {
        await errorOrFn()
    }

    if (errorOrFn) {
        throw errorOrFn
    }
}

/** Creates a deep "cause chain", to test that error handler correctly gets the most relevant error. */
export function fakeErrorChain(rootCause?: Error, toolkitErrors: boolean = true) {
    try {
        if (rootCause) {
            throw rootCause
        } else {
            throw new Error('generic error 1')
        }
    } catch (e1) {
        try {
            const e = new UnknownError(e1)
            throw e
        } catch (e2) {
            try {
                const e = toolkitErrors ? new SamCliError('sam error', { cause: e2 as Error }) : new Error('error 3')
                if (!toolkitErrors) {
                    ;(e as any).cause = e2
                }
                throw e
            } catch (e3) {
                const e = toolkitErrors
                    ? ToolkitError.chain(e3, 'ToolkitError message', {
                          documentationUri: vscode.Uri.parse('https://docs.aws.amazon.com/toolkit-for-vscode/'),
                      })
                    : new Error('last error')
                if (!toolkitErrors) {
                    ;(e as any).cause = e3
                }
                throw e
            }
        }
    }
}

const testCommand = Commands.register({ id: '_test.throwable', telemetryThrottleMs: false }, throwMe)

describe('runCommand', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('emits a telemetry metric after the command terminates (success)', async function () {
        await testCommand.execute()

        assertTelemetry('vscode_executeCommand', {
            passive: true,
            command: testCommand.id,
            result: 'Succeeded',
        })
    })

    it('emits a telemetry metric after the command terminates (cancel)', async function () {
        await testCommand.execute(new CancellationError('user'))

        assertTelemetry('vscode_executeCommand', {
            passive: true,
            command: testCommand.id,
            result: 'Cancelled',
            reason: 'user',
        })
    })

    it('emits a telemetry metric after the command terminates (failure)', async function () {
        const viewLogsDialog = getTestWindow().waitForMessage(/Something failed/)

        await Promise.all([
            viewLogsDialog.then(dialog => dialog.close()),
            testCommand.execute(new ToolkitError('Something failed', { code: 'SomethingFailed' })),
        ])

        assertTelemetry('vscode_executeCommand', {
            passive: true,
            command: testCommand.id,
            result: 'Failed',
            reason: 'SomethingFailed',
        })
    })

    describe('shows error', function () {
        let tempFolder: string
        let unwritableFile: string

        before(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
            unwritableFile = path.join(tempFolder, 'unwritableFile')
            await fsPromises.writeFile(unwritableFile, 'foo', { mode: 0o400 })
        })

        after(async function () {
            await SystemUtilities.delete(tempFolder, { recursive: true })
        })

        async function runAndWaitForMessage(expectedMsg: string | RegExp, willThrow: () => Promise<never>) {
            const viewLogsDialog = getTestWindow().waitForMessage(expectedMsg)

            await Promise.all([viewLogsDialog.then(dialog => dialog.close()), testCommand.execute(willThrow)])
        }

        function assertTelem(reason: string) {
            assertTelemetry('vscode_executeCommand', {
                passive: true,
                command: testCommand.id,
                result: 'Failed',
                reason: reason,
            })
        }

        it('vscode ISDIR', async function () {
            if (env.isMinVscode('1.83.0')) {
                this.skip()
            }

            const pat =
                os.platform() === 'linux'
                    ? // vscode error not raised on linux? 💩
                      /EISDIR: illegal operation on a directory/
                    : /EEXIST: file already exists/
            await runAndWaitForMessage(pat, async () => {
                // Try to write to the current directory. 💩
                const err = await SystemUtilities.writeFile('.', 'foo').catch(e => e)
                const err2 = new Error('generic error')
                ;(err2 as any).cause = err
                throw err2
            })
            // TODO: commands.run() should use getBestError (if the top error is not ToolkitError)?
            // assertTelem('FileExists')
            assertTelem('Error')
        })

        it('nodejs ISDIR', async function () {
            await runAndWaitForMessage(/EISDIR: illegal operation on a directory/, async () => {
                // Try to write to the current directory. 💩
                const err = await fsPromises.writeFile('.', 'foo').catch(e => e)
                const err2 = new Error('generic error')
                ;(err2 as any).cause = err
                throw err2
            })
            // TODO: commands.run() should use getBestError (if the top error is not ToolkitError)?
            // assertTelem('EISDIR')
            assertTelem('Error')
        })

        it('toolkit `PermissionsError`', async function () {
            const viewLogsDialog = getTestWindow().waitForMessage(/incorrect permissions. Expected rw-, found r--/)

            await Promise.all([
                viewLogsDialog.then(dialog => dialog.close()),
                testCommand.execute(async () => {
                    const err = await SystemUtilities.writeFile(unwritableFile, 'bar').catch(e => e)
                    throw fakeErrorChain(err, false)
                }),
            ])

            // TODO: commands.run() should use getBestError (if the top error is not ToolkitError)?
            // assertTelem('InvalidPermissions')
            assertTelem('Error')
        })

        it('nodejs EACCES (not wrapped by toolkit `PermissionsError`)', async function () {
            const viewLogsDialog = getTestWindow().waitForMessage(/EACCES: permission denied/)

            await Promise.all([
                viewLogsDialog.then(dialog => dialog.close()),
                testCommand.execute(async () => {
                    const err = await fsPromises.writeFile(unwritableFile, 'bar').catch(e => e)
                    throw fakeErrorChain(err, false)
                }),
            ])

            // TODO: commands.run() should use getBestError (if the top error is not ToolkitError)?
            // assertTelem('EACCES')
            assertTelem('Error')
        })
    })

    describe('telemetry throttling', function () {
        it('collapses events that occur within a brief period of time', async function () {
            const command = Commands.register('_test.telemetry', () => {})
            await command.execute()
            await command.execute()
            await command.execute()

            const events = globals.telemetry.logger
                .query({ metricName: 'vscode_executeCommand' })
                .filter(event => event.command === command.id)

            assert.strictEqual(events.length, 1)
            assertTelemetry('vscode_executeCommand', {
                passive: true,
                command: command.id,
                result: 'Succeeded',
            })
        })

        it('does not collapse events marked with a telemetry name', async function () {
            const command = Commands.register({ id: '_test.telemetryName', telemetryName: 'aws_help' }, () => {})
            await command.execute()
            await command.execute()
            await command.execute()

            const events = globals.telemetry.logger.query({ metricName: 'aws_help' })
            assert.strictEqual(events.length, 3)
        })

        describe('`compositeKey` parameter', async function () {
            let clock: ReturnType<typeof installFakeClock>

            beforeEach(function () {
                clock = installFakeClock()
            })

            afterEach(function () {
                clock.uninstall()
            })

            it('"source" field makes the metric unique', async function () {
                const command = Commands.register(
                    {
                        id: '_test.telemetryName.sourceField',
                        compositeKey: { 1: 'source' },
                    },
                    (irrelevantArg: any, source: string) => {}
                )

                await command.execute(1, 'a') // events[0]
                await command.execute({}, 'b') // events[1]
                // These are throttled and increment the debounce count
                await command.execute([], 'a')
                await command.execute([], 'a')
                await command.execute([], 'b')
                // Forward time to after throttle period is over
                clock.tick(defaultTelemetryThrottleMs)
                await command.execute([], 'a') // events[2]
                await command.execute(undefined, 'b') // events[3]

                // assert expected telemetry events
                const events = globals.telemetry.logger.query({ metricName: 'vscode_executeCommand' })
                assert.strictEqual(events.length, 4)
                const event0 = events[0]
                assert.strictEqual(event0['source'], 'a')
                assert.strictEqual(event0['debounceCount'], undefined)
                const event1 = events[1]
                assert.strictEqual(event1['source'], 'b')
                assert.strictEqual(event1['debounceCount'], undefined)
                const event2 = events[2]
                assert.strictEqual(event2['source'], 'a')
                assert.strictEqual(event2['debounceCount'], '2')
                const event3 = events[3]
                assert.strictEqual(event3['source'], 'b')
                assert.strictEqual(event3['debounceCount'], '1')
            })

            it('throttles events when compositeKey not set', async function () {
                const command = Commands.register('_test.telemetryName.noCompositeKey', (obj: any) => {})

                await command.execute({ id: 'a' })
                // These will be throttled
                await command.execute(undefined)
                await command.execute('a')
                await command.execute('b')

                const events = globals.telemetry.logger.query({ metricName: 'vscode_executeCommand' })
                assert.strictEqual(events.length, 1)
            })

            it('sets source="unset" if arg not provided', async function () {
                // We do this so that an error isn't thrown but will indicate
                // something is wrong in telemetry that needs to be fixed
                const command = Commands.register(
                    {
                        id: '_test.telemetryName.outOfIndex',
                        compositeKey: { 1: 'source' }, // out of index
                    },
                    (source: any) => {}
                )
                await command.execute(1)
                assertTelemetry('vscode_executeCommand', {
                    passive: true,
                    command: command.id,
                    result: 'Succeeded',
                    source: 'vscodeUI',
                })
            })
        })
    })
})
