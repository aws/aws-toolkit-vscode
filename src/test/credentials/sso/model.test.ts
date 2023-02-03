/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createTestWindow } from '../../shared/vscode/window'
import { openSsoPortalLink } from '../../../credentials/sso/model'
import { assertTelemetry } from '../../testUtil'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'

describe('openSsoPortalLink', function () {
    let testWindow: ReturnType<typeof createTestWindow>
    let openExternal: sinon.SinonStub<any[], Thenable<boolean>>

    beforeEach(function () {
        sinon.replace(vscode, 'window', (testWindow = createTestWindow()))
        openExternal = sinon.stub(vscode.env, 'openExternal').resolves(true)
    })

    afterEach(function () {
        sinon.restore()
    })

    const userCode = 'user-code'
    const verificationUri = 'https://example.com/'
    async function runFlow(...actions: ('open' | 'help' | 'cancel')[]) {
        const copyCode = /copy code/i
        const waitForMessage = async (): Promise<void> =>
            testWindow.waitForMessage(copyCode).then(m => {
                assert.ok(m.detail?.includes(userCode), 'Expected message to show the user verification code')

                const action = actions.shift()
                if (action === 'open') {
                    m.selectItem(copyCode)
                } else if (action === 'help') {
                    m.selectItem(/help/i)
                    return waitForMessage()
                } else {
                    m.close()
                }
            })

        await Promise.all([waitForMessage(), openSsoPortalLink('', { verificationUri, userCode })])
    }

    it('copies to the clipboard and opens a link when selecting the open URL option', async function () {
        await runFlow('open')
        assert.ok(openExternal.calledOnce)
        assert.strictEqual(openExternal.args[0].toString(), verificationUri)
        assert.strictEqual(await vscode.env.clipboard.readText(), userCode)
        assertTelemetry('aws_loginWithBrowser', { result: 'Succeeded' })
    })

    it('does not copy code to clipboard or opens links if the user cancels', async function () {
        // This isn't mocked/stubbed so it'll clear the test runners clipboard
        await vscode.env.clipboard.writeText('')
        const result = await runFlow('cancel').catch(e => e)
        assert.ok(openExternal.notCalled)
        assert.ok(result instanceof CancellationError)
        assert.strictEqual(await vscode.env.clipboard.readText(), '')
        assertTelemetry('aws_loginWithBrowser', { result: 'Cancelled', reason: 'user' })
    })

    it('continues to show the notification if the user selects help', async function () {
        await runFlow('help', 'open')
        assert.ok(openExternal.calledTwice)
        assert.notStrictEqual(openExternal.args[0].toString(), openExternal.args[1].toString())
        assertTelemetry('aws_loginWithBrowser', { result: 'Succeeded' })
    })
})
