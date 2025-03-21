/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ZipStream, ZipStreamResult } from '../../../shared/utilities/zipStream'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import path from 'path'
import fs from '../../../shared/fs/fs'
import crypto from 'crypto'
// @ts-ignore
import { BlobWriter } from '@zip.js/zip.js'
import { assertLogsContain } from '../../globalSetup.test'

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
        await zipStream.writeString('foo bar', 'file.txt', true)
        const result = await zipStream.finalize()

        await verifyResult(result, path.join(tmpDir, 'test.zip'))
    })

    it('should create a zip stream from file', async function () {
        const testFilePath = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFilePath, 'foo bar')

        const zipStream = new ZipStream({ hashAlgorithm: 'md5' })
        zipStream.writeFile(testFilePath, 'file.txt')
        const result = await zipStream.finalize()

        await verifyResult(result, path.join(tmpDir, 'test.zip'))
    })

    it('should unzip from a buffer', async function () {
        const zipStream = new ZipStream()
        await zipStream.writeString('foo bar foo', 'file.txt', true)
        const result = await zipStream.finalize()

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)
        const zipEntries = await ZipStream.unzip(zipBuffer)
        assert.strictEqual(zipEntries[0].filename, 'file.txt')
        assert.strictEqual(zipEntries.length, 1)

        // Read data back from zip to verify
        const data = await zipEntries[0].getData!(new BlobWriter('text/plain'))
        const textData = await data.text()
        assert.strictEqual(textData, 'foo bar foo')
    })

    it('should write contents to file', async function () {
        const zipStream = new ZipStream()
        await zipStream.writeString('foo bar', 'file.txt', true)
        const zipPath = path.join(tmpDir, 'test.zip')
        const result = await zipStream.finalizeToFile(path.join(tmpDir, 'test.zip'))

        assert.strictEqual(result.sizeInBytes, (await fs.stat(zipPath)).size)
    })

    it('only writes to target paths once', async function () {
        const testFilePath = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFilePath, 'foo bar')
        const testFilePath2 = path.join(tmpDir, 'test2.txt')
        await fs.writeFile(testFilePath2, 'foo bar')

        const zipStream = new ZipStream()
        zipStream.writeFile(testFilePath, 'file.txt')
        zipStream.writeFile(testFilePath2, 'file.txt')
        const result = await zipStream.finalize()

        const zipBuffer = result.streamBuffer.getContents()
        assert.ok(zipBuffer)
        const zipEntries = await ZipStream.unzip(zipBuffer)

        assert.strictEqual(zipEntries.length, 1)
        assertLogsContain('duplicate file', false, 'debug')
    })
})

async function verifyResult(result: ZipStreamResult, zipPath: string) {
    const zipBuffer = result.streamBuffer.getContents()
    assert.ok(zipBuffer)

    await fs.writeFile(zipPath, zipBuffer)
    const expectedMd5 = crypto
        .createHash('md5')
        .update(await fs.readFileBytes(zipPath))
        .digest('base64')
    assert.strictEqual(result.hash, expectedMd5)
    assert.strictEqual(result.sizeInBytes, (await fs.stat(zipPath)).size)
}
