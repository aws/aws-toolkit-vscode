/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { initMessageHandler } from '../../../applicationcomposer/messageHandlers/initMessageHandler'
import { createTemplate, createWebviewContext } from '../utils'
import { disableIfVscodeBelow } from '../../testUtil'

describe('initMessageHandler', function () {
    it('not connected to codewhisperer', async function () {
        disableIfVscodeBelow(this, '1.89.0')
        const panel = await createTemplate()
        const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
        const context = await createWebviewContext({
            panel,
        })
        await initMessageHandler(context)
        assert.ok(postMessageSpy.calledOnce)
        assert.deepStrictEqual(postMessageSpy.getCall(0).args[0].isConnectedToCodeWhisperer, false)
        postMessageSpy.restore()
    })
})
