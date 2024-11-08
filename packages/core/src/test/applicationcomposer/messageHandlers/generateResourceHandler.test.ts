/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { createTemplate, createWebviewContext } from '../utils'
import { generateResourceHandler } from '../../../applicationcomposer/messageHandlers/generateResourceHandler'
import { Command, MessageType } from '../../../applicationcomposer/types'
import * as env from '../../../shared/vscode/env'

describe('generateResourceHandler', function () {
    it('amazon q is not installed', async function () {
        if (env.isMinVscode('1.89.0')) {
            this.skip()
        }
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
        postMessageSpy.restore()
    })
})
