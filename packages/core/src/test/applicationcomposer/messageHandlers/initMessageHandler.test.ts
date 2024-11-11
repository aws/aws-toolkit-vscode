/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { initMessageHandler } from '../../../applicationcomposer/messageHandlers/initMessageHandler'
import { createTemplate, createWebviewContext } from '../utils'

//eslint-disable-next-line aws-toolkits/no-only-in-tests
describe.only('initMessageHandler', function () {
    for (const _ of Array.from({ length: 1000 }, (i) => i)) {
        it('not connected to codewhisperer', async function () {
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
    }
})
