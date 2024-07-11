/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { initMessageHandler } from '../../../applicationcomposer/messageHandlers/initMessageHandler'
import { createTemplate, createWebviewContext } from '../utils'

describe('initMessageHandler', function () {
    afterEach(() => {
        sinon.restore()
    })

    it('not connected to codewhisperer', async () => {
        const panel = await createTemplate()
        const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
        const context = await createWebviewContext({
            panel,
        })
        await initMessageHandler(context)
        assert.ok(postMessageSpy.calledOnce)
        assert.deepStrictEqual(postMessageSpy.getCall(0).args[0].isConnectedToCodeWhisperer, false)
    })
})
