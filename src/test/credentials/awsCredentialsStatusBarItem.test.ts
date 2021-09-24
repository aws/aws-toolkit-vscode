/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as FakeTimers from '@sinonjs/fake-timers'
import { updateCredentialsStatusBarItem } from '../../credentials/awsCredentialsStatusBarItem'
import { tickPromise } from '../testUtil'

describe('updateCredentialsStatusBarItem', async function () {
    let statusBarItem: vscode.StatusBarItem
    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = FakeTimers.install()
    })

    after(function () {
        clock.uninstall()
    })

    beforeEach(async function () {
        statusBarItem = ({
            text: '',
        } as any) as vscode.StatusBarItem
    })

    it('updates text with credentials id', async function () {
        const credentialId = 'qwerty'

        await tickPromise(updateCredentialsStatusBarItem(statusBarItem, credentialId), clock, 2000)
        assert.ok(
            statusBarItem.text.includes(credentialId),
            'expected statusbar item text to contain the credentials id'
        )
    })

    it('updates text with placeholder when there is no credentials id', async function () {
        await tickPromise(updateCredentialsStatusBarItem(statusBarItem, undefined), clock, 2000)
        assert(statusBarItem.tooltip)
        assert.deepStrictEqual(statusBarItem.tooltip, 'Click to connect to AWS')
    })

    it('shows (connected) after a successful login', async function () {
        updateCredentialsStatusBarItem(statusBarItem, 'myprofile')
        assert.ok(
            statusBarItem.text.includes('(connected)'),
            'expected statusbar item text to indicate that the profile connected'
        )
    })
})
