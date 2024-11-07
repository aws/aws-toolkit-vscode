/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { createTemplate, createWebviewContext } from '../utils'
import { generateResourceHandler } from '../../../applicationcomposer/messageHandlers/generateResourceHandler'
import { Command, MessageType } from '../../../applicationcomposer/types'
import * as extApi from '../../../amazonq/extApi'

describe('generateResourceHandler', function () {
    afterEach(() => {
        sinon.restore()
    })
    // eslint-disable-next-line aws-toolkits/no-only-in-tests
    it.only('amazon q is not installed', async () => {
        for (const _ of Array.from({ length: 20 }, (i) => i)) {
            sinon.stub(extApi, 'getAmazonqApi')
            const panel = await createTemplate()
            console.log('post-createTemplate')
            const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
            const context = await createWebviewContext({
                panel,
            })
            console.log('post-createWebviewContext')
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
            console.log('post-generateResourceHandler')
            assert.ok(postMessageSpy.calledOnce)
            assert.deepStrictEqual(postMessageSpy.getCall(0).args[0].isSuccess, false)
            sinon.restore()
        }
    })
})
