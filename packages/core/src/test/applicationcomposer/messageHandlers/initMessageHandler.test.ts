/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { initMessageHandler } from '../../../applicationcomposer/messageHandlers/initMessageHandler'
import { createTemplate, createWebviewContext } from '../utils'
import { isMinVscode } from '../../../shared/vscode/env'

describe('initMessageHandler', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('not connected to codewhisperer', async function () {
        if (isMinVscode({ throwWhen: '1.89.0' })) {
            this.skip()
        }
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
