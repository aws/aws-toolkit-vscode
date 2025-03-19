/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ZipStream } from '../../../shared/utilities/zipStream'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import path from 'path'
import fs from '../../../shared/fs/fs'
import crypto from 'crypto'

describe('zipStream', function () {
    let tmpDir: string

    beforeEach(async function () {
        tmpDir = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.delete(tmpDir, { recursive: true })
    })

    it('should create a zip stream from text content', async function () {
        const zipStream = new ZipStream({ hashAlgorithm: 'md5' })
        await zipStream.writeString('foo bar', 'file.txt')
        const result = await zipStream.finalize()

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)

        const zipPath = path.join(tmpDir, 'test.zip')
        await fs.writeFile(zipPath, zipBuffer)
        const expectedMd5 = crypto
            .createHash('md5')
            .update(await fs.readFileBytes(zipPath))
            .digest('base64')
        assert.strictEqual(result.hash, expectedMd5)
        assert.strictEqual(result.sizeInBytes, (await fs.stat(zipPath)).size)
    })

    it('should create a zip stream from binary content', async function () {
        const zipStream = new ZipStream({ hashAlgorithm: 'md5' })
        await zipStream.writeData(Buffer.from('foo bar'), 'file.txt')
        const result = await zipStream.finalize()

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)

        const zipPath = path.join(tmpDir, 'test.zip')
        await fs.writeFile(zipPath, zipBuffer)
        const expectedMd5 = crypto
            .createHash('md5')
            .update(await fs.readFileBytes(zipPath))
            .digest('base64')
        assert.strictEqual(result.hash, expectedMd5)
        assert.strictEqual(result.sizeInBytes, (await fs.stat(zipPath)).size)

        const zipContents = await ZipStream.unzip(zipBuffer)
        assert.strictEqual(zipContents.length, 1)
        assert.strictEqual(zipContents[0].filename, 'file.txt')
    })

    it('should create a zip stream from file', async function () {
        const testFilePath = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFilePath, 'foo bar')

        const zipStream = new ZipStream({ hashAlgorithm: 'md5' })
        zipStream.writeFile(testFilePath, 'file.txt')
        const result = await zipStream.finalize()

        const zipPath = path.join(tmpDir, 'test.zip')

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)

        await fs.writeFile(zipPath, zipBuffer)
        const expectedMd5 = crypto
            .createHash('md5')
            .update(await fs.readFileBytes(zipPath))
            .digest('base64')
        assert.strictEqual(result.hash, expectedMd5)
        assert.strictEqual(result.sizeInBytes, (await fs.stat(zipPath)).size)
    })

    it('should unzip from a buffer', async function () {
        const zipStream = new ZipStream()
        await zipStream.writeString('foo bar', 'file.txt')
        const result = await zipStream.finalize()

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)
        const zipEntries = await ZipStream.unzip(zipBuffer)
        assert.strictEqual(zipEntries[0].filename, 'file.txt')
    })

    it('should write contents to file', async function () {
        const zipStream = new ZipStream()
        await zipStream.writeString('foo bar', 'file.txt')
        await zipStream.writeData(Buffer.from('foo bar'), 'file2.txt')
        const zipPath = path.join(tmpDir, 'test.zip')
        const result = await zipStream.finalizeToFile(path.join(tmpDir, 'test.zip'))

        assert.strictEqual(result.sizeInBytes, (await fs.stat(zipPath)).size)
    })
})
