/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import { Content, LspController } from 'aws-core-vscode/amazonq'
import { createTestFile } from 'aws-core-vscode/test'
import { fs } from 'aws-core-vscode/shared'

describe('Amazon Q LSP controller', function () {
    it('Download mechanism checks against hash, when hash matches', async function () {
        const content = {
            filename: 'qserver-linux-x64.zip',
            url: 'https://x/0.0.6/qserver-linux-x64.zip',
            hashes: [
                'sha384:768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9',
            ],
            bytes: 512,
        } as Content
        const lspController = new LspController()
        sinon.stub(lspController, '_download')
        const mockFileName = 'test_case_1.zip'
        const mockDownloadFile = await createTestFile(mockFileName)
        await fs.writeFile(mockDownloadFile.fsPath, 'test')
        const result = await lspController.downloadAndCheckHash(mockDownloadFile.fsPath, content)
        assert.strictEqual(result, true)
    })

    it('Download mechanism checks against hash, when hash does not match', async function () {
        const content = {
            filename: 'qserver-linux-x64.zip',
            url: 'https://x/0.0.6/qserver-linux-x64.zip',
            hashes: [
                'sha384:38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
            ],
            bytes: 512,
        } as Content
        const lspController = new LspController()
        sinon.stub(lspController, '_download')
        const mockFileName = 'test_case_2.zip'
        const mockDownloadFile = await createTestFile(mockFileName)
        await fs.writeFile(mockDownloadFile.fsPath, 'file_content')
        const result = await lspController.downloadAndCheckHash(mockDownloadFile.fsPath, content)
        assert.strictEqual(result, false)
    })

    afterEach(() => {
        sinon.restore()
    })
})
