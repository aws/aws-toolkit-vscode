/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { createTemplate, createWebviewContext } from '../utils'
import { generateResourceHandler } from '../../../applicationcomposer/messageHandlers/generateResourceHandler'
import { Command, MessageType } from '../../../applicationcomposer/types'

// eslint-disable-next-line aws-toolkits/no-only-in-tests
describe.only('generateResourceHandler', function () {
    afterEach(() => {
        sinon.restore()
    })
    for (const _ of Array.from({ length: 1000 }, (i) => i)) {
        it('amazon q is not installed', async () => {
            this.retries(10)
            const panel = await createTemplate()
            const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
            const context = await createWebviewContext({
                panel,
            })
            await generateResourceHandler(
                {
                    command: Command.GENERATE_RESOURCE,
                    messageType: MessageType.REQUEST,
                    cfnType: '',
                    prompt: '',
                    traceId: '0',
                },
                context
            )
            assert.ok(postMessageSpy.calledOnce)
            assert.deepStrictEqual(postMessageSpy.getCall(0).args[0].isSuccess, false)
            sinon.restore()
        })
    }
})
