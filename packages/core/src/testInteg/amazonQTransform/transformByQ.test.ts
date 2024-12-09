/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import * as codeWhisperer from '../../codewhisperer/client/codewhisperer'
import assert from 'assert'
import { getSha256, uploadArtifactToS3, zipCode } from '../../codewhisperer/service/transformByQ/transformApiHandler'
import request from '../../shared/request'
import { transformByQState, ZipManifest } from '../../codewhisperer/models/model'
import globals from '../../shared/extensionGlobals'
import { fs } from '../../shared'
import { setValidConnection } from '../../testE2E/util/connection'

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
        await fs.mkdir(tempDir)
        tempFileName = `testfile-${globals.clock.Date.now()}.txt`
        tempFilePath = path.join(tempDir, tempFileName)
        await fs.writeFile(tempFilePath, 'sample content for the test file')
        transformByQState.setProjectPath(tempDir)
        const zipCodeResult = await zipCode({
            projectPath: tempDir,
            zipManifest: new ZipManifest(),
        })
        zippedCodePath = zipCodeResult.tempFilePath
    })

    after(async function () {
        if (tempDir !== '') {
            await fs.delete(tempDir, { recursive: true })
        }
    })

    it('WHEN upload payload with missing sha256 in headers THEN fails to upload', async function () {
        const buffer = Buffer.from(await fs.readFileBytes(zippedCodePath))
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
        const body = await fs.readFileText(zippedCodePath)
        await assert.rejects(
            () =>
                request.fetch('PUT', response.uploadUrl, {
                    body: body,
                    headers: headersObj,
                }).response
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

    it('WHEN createUploadUrl THEN URL uses HTTPS and sets 30 minute expiration', async function () {
        const buffer = Buffer.from(await fs.readFileBytes(zippedCodePath))
        const sha256 = getSha256(buffer)
        const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        const uploadUrl = response.uploadUrl
        const usesHttpsAndExpiresAfter30Minutes =
            uploadUrl.includes('https') && uploadUrl.includes('X-Amz-Expires=1800')
        assert.strictEqual(usesHttpsAndExpiresAfter30Minutes, true)
    })
})
