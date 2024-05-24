/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'

import * as sinon from 'sinon'
import assert from 'assert'
import { ToolkitError } from '../../../shared/errors'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { Commands, defaultTelemetryThrottleMs, unsetSource } from '../../../shared/vscode/commands2'
import { assertTelemetry, installFakeClock } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'

async function throwMe(
    error?: unknown
): Promise<void | never /* eslint-disable @typescript-eslint/no-redundant-type-constituents */> {
    if (error) {
        throw error
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

            it('sets "unset" source if it does not exist in args', async function () {
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
                    source: unsetSource,
                })
            })
        })
    })
})
