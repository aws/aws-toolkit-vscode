/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { Commands } from '../../../shared/vscode/commands2'
import { createTestWindow } from '../../shared/vscode/window'
import { AppRunnerServiceNode } from '../../../apprunner/explorer/apprunnerServiceNode'
import { assertTelemetry } from '../../testUtil'

describe('deleteService', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('emits a "Cancelled" result on cancel', async function () {
        const command = await Commands.get('aws.apprunner.deleteService')
        assert.ok(command, 'Expected command to exist')

        const testWindow = createTestWindow()
        sinon.replace(vscode, 'window', testWindow)

        const node: AppRunnerServiceNode = { info: { Status: 'CREATE_FAILED' } } as any

        const pendingMessage = testWindow.waitForMessage(/Delete/)
        pendingMessage.then(m => m.selectItem('Cancel'))
        await command.execute(node)

        assertTelemetry('apprunner_deleteService', {
            passive: false,
            result: 'Cancelled',
            appRunnerServiceStatus: 'CREATE_FAILED',
        })
    })

    it('emits service status metadata when running the command', async function () {
        const command = await Commands.get('aws.apprunner.deleteService')
        assert.ok(command, 'Expected command to exist')

        const testWindow = createTestWindow()
        sinon.replace(vscode, 'window', testWindow)

        const node: AppRunnerServiceNode = {
            info: { Status: 'CREATE_FAILED' },
            async delete() {},
        } as any

        const pendingMessage = testWindow.waitForMessage(/Delete/)
        pendingMessage.then(m => m.selectItem('OK'))
        await command.execute(node)

        assertTelemetry('apprunner_deleteService', {
            passive: false,
            result: 'Succeeded',
            appRunnerServiceStatus: 'CREATE_FAILED',
        })
    })
})
