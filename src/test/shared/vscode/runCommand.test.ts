/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { ToolkitError } from '../../../shared/errors'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { Commands } from '../../../shared/vscode/commands2'
import { assertTelemetry } from '../../testUtil'
import { createTestWindow } from './window'

async function throwMe(error?: unknown): Promise<void | never> {
    if (error) {
        throw error
    }
}

const testCommand = Commands.register('_test.throwable', throwMe)

describe('runCommand', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('emits a telemetry metric after the command terminates (success)', async function () {
        await testCommand.execute()

        assertTelemetry('vscode_executeCommand', {
            passive: true,
            debounceCount: 0,
            command: testCommand.id,
            result: 'Succeeded',
        })
    })

    it('emits a telemetry metric after the command terminates (cancel)', async function () {
        await testCommand.execute(new CancellationError('user'))

        assertTelemetry('vscode_executeCommand', {
            passive: true,
            debounceCount: 0,
            command: testCommand.id,
            result: 'Cancelled',
            reason: 'user',
        })
    })

    it('emits a telemetry metric after the command terminates (failure)', async function () {
        const testWindow = createTestWindow()
        sinon.replace(vscode, 'window', testWindow)

        const viewLogsDialog = testWindow.waitForMessage(/Something failed/)

        await Promise.all([
            viewLogsDialog.then(dialog => dialog.close()),
            testCommand.execute(new ToolkitError('Something failed', { code: 'SomethingFailed' })),
        ])

        assertTelemetry('vscode_executeCommand', {
            passive: true,
            debounceCount: 0,
            command: testCommand.id,
            result: 'Failed',
            reason: 'SomethingFailed',
        })
    })
})
