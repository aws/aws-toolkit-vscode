/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ZipStream } from '../../../shared/utilities/zipStream'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import path from 'path'
import { fsCommon } from '../../../srcShared/fs'
import crypto from 'crypto'

describe('zipStream', function () {
    let tmpDir: string

    beforeEach(async function () {
        tmpDir = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await SystemUtilities.delete(tmpDir, { recursive: true })
    })

    it('Should create a zip stream from text content', async function () {
        const zipStream = new ZipStream()
        zipStream.writeString('foo bar', 'file.txt')
        const result = await zipStream.finalize()

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)

        const zipPath = path.join(tmpDir, 'test.zip')
        await fsCommon.writeFile(zipPath, zipBuffer)
        const expectedMd5 = crypto
            .createHash('md5')
            .update(await fsCommon.readFile(zipPath))
            .digest('base64')
        assert.strictEqual(result.md5, expectedMd5)
        assert.strictEqual(result.sizeInBytes, (await fsCommon.stat(zipPath)).size)
    })

    it('Should create a zip stream from file', async function () {
        const testFilePath = path.join(tmpDir, 'test.txt')
        await fsCommon.writeFile(testFilePath, 'foo bar')

        const zipStream = new ZipStream()
        zipStream.writeFile(testFilePath, 'file.txt')
        const result = await zipStream.finalize()

        const zipPath = path.join(tmpDir, 'test.zip')

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)

        await fsCommon.writeFile(zipPath, zipBuffer)
        const expectedMd5 = crypto
            .createHash('md5')
            .update(await fsCommon.readFile(zipPath))
            .digest('base64')
        assert.strictEqual(result.md5, expectedMd5)
        assert.strictEqual(result.sizeInBytes, (await fsCommon.stat(zipPath)).size)
    })
})
