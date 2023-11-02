/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'

import * as sinon from 'sinon'
import assert from 'assert'
import { ToolkitError } from '../../../shared/errors'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import {
    BaseCommandSource,
    Commands,
    defaultTelemetryThrottleMs,
    setTelemetrySource,
    source,
} from '../../../shared/vscode/commands2'
import { assertTelemetry, installFakeClock } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'

async function throwMe(error?: unknown): Promise<void | never> {
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

        it('treats an event with a different CommandSource as a separate event', async function () {
            const command = Commands.register('_test.telemetryName.commandSourceArg', (source: BaseCommandSource) => {
                setTelemetrySource(source)
            })

            await command.execute(source('a'))
            await command.execute(source('b'))
            // The telemetry from these will be throttled
            await command.execute(source('a'))
            await command.execute(source('b'))

            const events = globals.telemetry.logger.query({ metricName: 'vscode_executeCommand' })
            assert.strictEqual(events.length, 2)
            assert.strictEqual(events.filter(e => e['source'] === 'a').length, 1)
            assert.strictEqual(events.filter(e => e['source'] === 'b').length, 1)
        })

        it('collapses events without a CommandSource in their args', async function () {
            const command = Commands.register('_test.telemetryName.nonCommandSourceArg', (obj: any) => {})
            await command.execute({ id: 'a' })
            await command.execute({ id: 'a' })
            await command.execute(undefined)
            await command.execute(undefined)

            const events = globals.telemetry.logger.query({ metricName: 'vscode_executeCommand' })
            assert.strictEqual(events.length, 1)
        })

        it('correctly increments the debounce counter when CommandSource is an arg', async function () {
            const command = Commands.register(
                '_test.telemetryName.commandSourceArgDebounceCount',
                (source: BaseCommandSource) => {
                    setTelemetrySource(source)
                }
            )

            const clock = installFakeClock()

            await command.execute(source('a'))
            // following 3 events will be debounced
            await command.execute(source('a'))
            await command.execute(source('a'))
            await command.execute(source('a'))
            // advance clock past throttle time
            clock.tick(defaultTelemetryThrottleMs)
            // will contain a 'debounceCount' of 3
            await command.execute(source('a'))

            const events = globals.telemetry.logger.query({ metricName: 'vscode_executeCommand' })
            assert.strictEqual(events.length, 2)

            const firstEvent = events[0]
            assert.strictEqual(firstEvent['source'], 'a')
            assert.strictEqual(firstEvent['debounceCount'], undefined)

            const secondEvent = events[1]
            assert.strictEqual(secondEvent['source'], 'a')
            assert.strictEqual(secondEvent['debounceCount'], '3')
        })
    })
})
