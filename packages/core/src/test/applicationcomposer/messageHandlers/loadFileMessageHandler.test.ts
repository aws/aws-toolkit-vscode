/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import path from 'path'
import { createSymlinkOrSkip, createTemplate, createWebviewContext } from '../utils'
import { loadFileMessageHandler } from '../../../applicationcomposer/messageHandlers/loadFileMessageHandler'
import { Command, MessageType } from '../../../applicationcomposer/types'
import { TestFolder } from '../../testUtil'

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

    describe('symbolic links', function () {
        let testFolder: TestFolder
        let workspace: string
        let outsideFile: string

        beforeEach(async function () {
            testFolder = await TestFolder.create()
            workspace = await testFolder.mkdir('project')
            outsideFile = await testFolder.write('outside/secret.txt', 'secret')
        })

        async function loadFile(fileName: string, workSpacePath: string = workspace) {
            const panel = await createTemplate()
            const postMessageSpy = sinon.spy(panel.webview, 'postMessage')
            const context = await createWebviewContext({
                panel,
                workSpacePath,
                defaultTemplatePath: path.join(workSpacePath, 'template.yaml'),
            })

            await loadFileMessageHandler(
                {
                    command: Command.LOAD_FILE,
                    messageType: MessageType.REQUEST,
                    eventId: '1',
                    fileName,
                },
                context
            )

            assert.ok(postMessageSpy.calledOnce)
            return postMessageSpy.getCall(0).args[0]
        }

        it('rejects a link to a file outside of the workspace', async function () {
            await createSymlinkOrSkip(this, outsideFile, path.join(workspace, 'link.txt'))

            const response = await loadFile('link.txt')

            assert.strictEqual(response.isSuccess, false)
            assert.ok(response.failureReason.includes('outside of workspace'))
            assert.strictEqual(response.fileContents, '')
        })

        it('rejects a file in a linked folder outside of the workspace', async function () {
            await createSymlinkOrSkip(this, path.dirname(outsideFile), path.join(workspace, 'linked'), 'dir')

            const response = await loadFile('linked/secret.txt')

            assert.strictEqual(response.isSuccess, false)
            assert.ok(response.failureReason.includes('outside of workspace'))
            assert.strictEqual(response.fileContents, '')
        })

        it('rejects a link whose target does not exist', async function () {
            const target = path.join(path.dirname(outsideFile), 'missing.txt')
            await createSymlinkOrSkip(this, target, path.join(workspace, 'link.txt'))

            const response = await loadFile('link.txt')

            assert.strictEqual(response.isSuccess, false)
            assert.ok(response.failureReason.includes('outside of workspace'))
            assert.strictEqual(response.fileContents, '')
        })

        it('loads a link to a file inside of the workspace', async function () {
            const target = await testFolder.write('project/real.txt', 'inside')
            await createSymlinkOrSkip(this, target, path.join(workspace, 'link.txt'))

            const response = await loadFile('link.txt')

            assert.strictEqual(response.isSuccess, true)
            assert.strictEqual(response.fileContents, 'inside')
        })

        it('loads a file when the workspace path contains a link', async function () {
            await testFolder.write('project/real.txt', 'inside')
            const linkedWorkspace = testFolder.pathFrom('project-link')
            await createSymlinkOrSkip(this, workspace, linkedWorkspace, 'dir')

            const response = await loadFile('real.txt', linkedWorkspace)

            assert.strictEqual(response.isSuccess, true)
            assert.strictEqual(response.fileContents, 'inside')
        })
    })
})
