/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import path from 'path'
import { createTemplate, createWebviewContext } from '../utils'
import { saveFileMessageHandler } from '../../../applicationcomposer/messageHandlers/saveFileMessageHandler'
import { Command, MessageType } from '../../../applicationcomposer/types'

describe('saveFileMessageHandler', function () {
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

        await saveFileMessageHandler(
            {
                command: Command.SAVE_FILE,
                messageType: MessageType.REQUEST,
                eventId: '1',
                filePath: '../../etc/malicious',
                fileContents: 'malicious content',
            },
            context
        )

        assert.ok(postMessageSpy.calledOnce)
        const response = postMessageSpy.getCall(0).args[0]
        assert.strictEqual(response.isSuccess, false)
        assert.ok(response.failureReason.includes('outside of workspace'))
    })

    it('rejects path traversal via absolute path component', async function () {
        const panel = await createTemplate()
        const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
        const context = await createWebviewContext({
            panel,
            workSpacePath: '/workspace/project',
            defaultTemplatePath: '/workspace/project/template.yaml',
        })

        await saveFileMessageHandler(
            {
                command: Command.SAVE_FILE,
                messageType: MessageType.REQUEST,
                eventId: '2',
                filePath: '../../../tmp/evil',
                fileContents: 'malicious content',
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
        const tmpDir = path.join(__dirname, 'tmp-test-workspace')
        const context = await createWebviewContext({
            panel,
            workSpacePath: tmpDir,
            defaultTemplatePath: path.join(tmpDir, 'template.yaml'),
        })

        // This should NOT be rejected by the path traversal check
        // (it may fail for other reasons like the directory not existing, which is fine)
        await saveFileMessageHandler(
            {
                command: Command.SAVE_FILE,
                messageType: MessageType.REQUEST,
                eventId: '3',
                filePath: 'subdir/file.yaml',
                fileContents: 'safe content',
            },
            context
        )

        assert.ok(postMessageSpy.calledOnce)
        const response = postMessageSpy.getCall(0).args[0]
        // Should not fail with "outside of workspace" error
        if (!response.isSuccess) {
            assert.ok(!response.failureReason.includes('outside of workspace'))
        }
    })
})
