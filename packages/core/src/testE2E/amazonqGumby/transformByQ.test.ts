/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getSha256, uploadArtifactToS3, zipCode } from '../../codewhisperer/service/transformByQHandler'
import request from '../../common/request'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import * as codeWhisperer from '../../codewhisperer/client/codewhisperer'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { setValidConnection } from '../util/amazonQUtil'
import { transformByQState } from '../../codewhisperer/models/model'

describe('transformByQ', async function () {
    let tempDir = ''
    let tempFileName = ''
    let tempFilePath = ''
    let zippedCodePath = ''
    let validConnection: boolean

    before(async function () {
        validConnection = await setValidConnection()
        if (!validConnection) {
            this.skip()
        }
        tempDir = path.join(os.tmpdir(), 'gumby-test')
        fs.mkdirSync(tempDir)
        tempFileName = `testfile-${Date.now()}.txt`
        tempFilePath = path.join(tempDir, tempFileName)
        fs.writeFileSync(tempFilePath, 'sample content for the test file')
        transformByQState.setProjectPath(tempDir)
        zippedCodePath = await zipCode()
    })

    after(async function () {
        if (tempDir !== '') {
            await fs.remove(tempDir)
        }
    })

    it('WHEN upload payload with missing sha256 in headers THEN fails to upload', async function () {
        const buffer = fs.readFileSync(zippedCodePath)
        const sha256 = getSha256(buffer)
        const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        const headersObj = {
            'x-amz-checksum-sha256': '',
            'Content-Type': 'application/zip',
        }
        await assert.rejects(
            () =>
                request.fetch('PUT', response.uploadUrl, { body: fs.readFileSync(zippedCodePath), headers: headersObj })
                    .response
        )
    })

    it('WHEN upload artifact to S3 with unsigned upload URL THEN fails to upload', async function () {
        await assert.rejects(() =>
            uploadArtifactToS3(
                zippedCodePath,
                {
                    uploadId: 'dummyId',
                    uploadUrl: 'https://aws-transform-artifacts-us-east-1.s3.amazonaws.com',
                },
                'dummy',
                Buffer.from('', 'utf-8')
            )
        )
    })

    it('WHEN createUploadUrl THEN URL uses HTTPS and sets 60 second expiration', async function () {
        const buffer = fs.readFileSync(zippedCodePath)
        const sha256 = getSha256(buffer)
        const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        const uploadUrl = response.uploadUrl
        const usesHttpsAndExpiresAfter60Seconds = uploadUrl.includes('https') && uploadUrl.includes('X-Amz-Expires=60')
        assert.strictEqual(usesHttpsAndExpiresAfter60Seconds, true)
    })

    it('WHEN zipCode THEN ZIP contains all expected files and no unexpected files', async function () {
        const zipFiles = new AdmZip(zippedCodePath).getEntries()
        const zipFileNames: string[] = []
        zipFiles.forEach(file => {
            zipFileNames.push(file.name)
        })
        assert.strictEqual(zipFileNames.length, 2) // expecting only a dummy txt file and a manifest.json
        assert.strictEqual(zipFileNames.includes(tempFileName) && zipFileNames.includes('manifest.json'), true)
    })
})
