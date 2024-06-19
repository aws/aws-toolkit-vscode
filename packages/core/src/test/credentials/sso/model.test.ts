/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { openSsoPortalLink, openSsoUrl, proceedToBrowser } from '../../../auth/sso/model'
import { getOpenExternalStub } from '../../globalSetup.test'
import { getTestWindow } from '../../shared/vscode/window'

describe('openSsoPortalLink', function () {
    beforeEach(function () {
        getOpenExternalStub().resolves(true)
    })

    const userCode = 'user-code'
    const verificationUri = 'https://example.com/'
    async function runFlow(...actions: ('open' | 'help' | 'cancel')[]) {
        const confirmCode = /Confirm Code for/
        const waitForMessage = async (): Promise<void> =>
            getTestWindow()
                .waitForMessage(confirmCode)
                .then(m => {
                    assert.ok(m.detail?.includes(userCode), 'Expected message to show the user verification code')

                    const action = actions.shift()
                    if (action === 'open') {
                        m.selectItem(proceedToBrowser)
                    } else if (action === 'help') {
                        m.selectItem(/help/i)
                        return waitForMessage()
                    } else {
                        m.close()
                    }
                })

        await Promise.all([waitForMessage(), openSsoPortalLink('', { verificationUri, userCode })])
    }

    it('opens a "confirm code" link when selecting the open URL option', async function () {
        await runFlow('open')
        assert.ok(getOpenExternalStub().calledOnce)
        assert.strictEqual(getOpenExternalStub().args[0].toString(), `${verificationUri}?user_code%3D${userCode}`)
    })

    it('continues to show the notification if the user selects help', async function () {
        this.skip()
    })
})

describe('openSsoUrl', function () {
    const verificationUri = vscode.Uri.parse('https://example.com/')

    it('opens a link', async function () {
        getOpenExternalStub().resolves(true)
        await openSsoUrl(verificationUri)
        assert.ok(getOpenExternalStub().calledOnce)
        assert.strictEqual(getOpenExternalStub().args[0].toString(), `${verificationUri}`)
    })

    it('canceled opening a link', async function () {
        getOpenExternalStub().resolves(false)
        await assert.rejects(async () => {
            await openSsoUrl(verificationUri)
        })
        assert.ok(getOpenExternalStub().calledOnce)
        assert.strictEqual(getOpenExternalStub().args[0].toString(), `${verificationUri}`)
    })
})
