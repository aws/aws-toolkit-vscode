/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { createTemplate, createWebviewContext } from '../utils'
import { loadFileMessageHandler } from '../../../applicationcomposer/messageHandlers/loadFileMessageHandler'
import { Command, MessageType } from '../../../applicationcomposer/types'

describe('loadFileMessageHandler', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('rejects path traversal via relative path', async function () {
        const panel = await createTemplate()
        const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
        const context = await createWebviewContext({
            panel,
            workSpacePath: '/workspace/project',
            defaultTemplatePath: '/workspace/project/template.yaml',
        })

        await loadFileMessageHandler(
            {
                command: Command.LOAD_FILE,
                messageType: MessageType.REQUEST,
                eventId: '1',
                fileName: '../../etc/passwd',
            },
            context
        )

        assert.ok(postMessageSpy.calledOnce)
        const response = postMessageSpy.getCall(0).args[0]
        assert.strictEqual(response.isSuccess, false)
        assert.ok(response.failureReason.includes('outside of workspace'))
    })

    it('rejects deeply nested traversal', async function () {
        const panel = await createTemplate()
        const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
        const context = await createWebviewContext({
            panel,
            workSpacePath: '/workspace/project',
            defaultTemplatePath: '/workspace/project/template.yaml',
        })

        await loadFileMessageHandler(
            {
                command: Command.LOAD_FILE,
                messageType: MessageType.REQUEST,
                eventId: '2',
                fileName: 'subdir/../../../etc/shadow',
            },
            context
        )

        assert.ok(postMessageSpy.calledOnce)
        const response = postMessageSpy.getCall(0).args[0]
        assert.strictEqual(response.isSuccess, false)
        assert.ok(response.failureReason.includes('outside of workspace'))
    })

    it('allows valid relative path within workspace', async function () {
        const panel = await createTemplate()
        const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
        const context = await createWebviewContext({
            panel,
            workSpacePath: '/workspace/project',
            defaultTemplatePath: '/workspace/project/template.yaml',
        })

        await loadFileMessageHandler(
            {
                command: Command.LOAD_FILE,
                messageType: MessageType.REQUEST,
                eventId: '3',
                fileName: 'subdir/template.yaml',
            },
            context
        )

        assert.ok(postMessageSpy.calledOnce)
        const response = postMessageSpy.getCall(0).args[0]
        // Should not fail with "outside of workspace" — may fail for file-not-found, which is fine
        if (!response.isSuccess) {
            assert.ok(!response.failureReason.includes('outside of workspace'))
        }
    })
})
