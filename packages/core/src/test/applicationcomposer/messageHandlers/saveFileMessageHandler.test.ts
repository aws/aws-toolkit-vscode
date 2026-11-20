/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import path from 'path'
import { createSymlinkOrSkip, getHandlerResponse, traversalWorkspaceContext } from '../utils'
import { saveFileMessageHandler } from '../../../applicationcomposer/messageHandlers/saveFileMessageHandler'
import { Command, MessageType, SaveFileRequestMessage } from '../../../applicationcomposer/types'
import { TestFolder } from '../../testUtil'
import fs from '../../../shared/fs/fs'

function saveRequest(filePath: string, fileContents: string): SaveFileRequestMessage {
    return { command: Command.SAVE_FILE, messageType: MessageType.REQUEST, eventId: '1', filePath, fileContents }
}

describe('saveFileMessageHandler', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('rejects path traversal via relative path', async function () {
        const response = await getHandlerResponse(
            saveFileMessageHandler,
            saveRequest('../../etc/malicious', 'malicious content'),
            traversalWorkspaceContext
        )

        assert.strictEqual(response.isSuccess, false)
        assert.ok(response.failureReason.includes('outside of workspace'))
    })

    it('rejects path traversal via absolute path component', async function () {
        const response = await getHandlerResponse(
            saveFileMessageHandler,
            saveRequest('../../../tmp/evil', 'malicious content'),
            traversalWorkspaceContext
        )

        assert.strictEqual(response.isSuccess, false)
        assert.ok(response.failureReason.includes('outside of workspace'))
    })

    it('allows valid relative path within workspace', async function () {
        const tmpDir = path.join(__dirname, 'tmp-test-workspace')

        // This should NOT be rejected by the path traversal check
        // (it may fail for other reasons like the directory not existing, which is fine)
        const response = await getHandlerResponse(
            saveFileMessageHandler,
            saveRequest('subdir/file.yaml', 'safe content'),
            {
                workSpacePath: tmpDir,
                defaultTemplatePath: path.join(tmpDir, 'template.yaml'),
            }
        )

        // Should not fail with "outside of workspace" error
        if (!response.isSuccess) {
            assert.ok(!response.failureReason.includes('outside of workspace'))
        }
    })

    describe('symbolic links', function () {
        let testFolder: TestFolder
        let workspace: string
        let outsideFolder: string

        beforeEach(async function () {
            testFolder = await TestFolder.create()
            workspace = await testFolder.mkdir('project')
            outsideFolder = await testFolder.mkdir('outside')
        })

        function saveFile(filePath: string, fileContents: string) {
            return getHandlerResponse(saveFileMessageHandler, saveRequest(filePath, fileContents), {
                workSpacePath: workspace,
                defaultTemplatePath: path.join(workspace, 'template.yaml'),
            })
        }

        it('rejects a write through a link to a file outside of the workspace', async function () {
            const target = await testFolder.write('outside/target.txt', 'original')
            await createSymlinkOrSkip(this, target, path.join(workspace, 'link.txt'))

            const response = await saveFile('link.txt', 'changed')

            assert.strictEqual(response.isSuccess, false)
            assert.ok(response.failureReason.includes('outside of workspace'))
            assert.strictEqual(await fs.readFileText(target), 'original')
        })

        it('rejects a write through a link whose target does not exist', async function () {
            const target = path.join(outsideFolder, 'new.txt')
            await createSymlinkOrSkip(this, target, path.join(workspace, 'link.txt'))

            const response = await saveFile('link.txt', 'changed')

            assert.strictEqual(response.isSuccess, false)
            assert.ok(response.failureReason.includes('outside of workspace'))
            assert.strictEqual(await fs.exists(target), false)
        })

        it('rejects a new file in a linked folder outside of the workspace', async function () {
            await createSymlinkOrSkip(this, outsideFolder, path.join(workspace, 'linked'), 'dir')

            const response = await saveFile('linked/new.txt', 'changed')

            assert.strictEqual(response.isSuccess, false)
            assert.ok(response.failureReason.includes('outside of workspace'))
            assert.strictEqual(await fs.exists(path.join(outsideFolder, 'new.txt')), false)
        })

        it('writes a new file inside of the workspace', async function () {
            const response = await saveFile('new.txt', 'content')

            assert.strictEqual(response.isSuccess, true)
            assert.strictEqual(await fs.readFileText(path.join(workspace, 'new.txt')), 'content')
        })

        it('saves the opened template when the template file is a link', async function () {
            const target = await testFolder.write('outside/template.yaml', 'original')
            await createSymlinkOrSkip(this, target, path.join(workspace, 'template.yaml'))

            const response = await saveFile('', 'changed')

            assert.strictEqual(response.isSuccess, true)
            assert.strictEqual(await fs.readFileText(target), 'changed')
        })
    })
})
