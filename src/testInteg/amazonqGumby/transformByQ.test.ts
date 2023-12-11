/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { uploadArtifactToS3, zipCode, getSha256 } from '../../codewhisperer/service/transformByQHandler'
import fetch from '../../common/request'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import * as codeWhisperer from '../../codewhisperer/client/codewhisperer'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { setValidConnection, skiptTestIfNoValidConn } from '../util/codewhispererUtil'

describe('transformByQ', function () {
    let tempDir = ''
    let tempFileName = ''
    let tempFilePath = ''
    let zippedCodePath = ''
    let validConnection: boolean

    before(async function () {
        validConnection = await setValidConnection()
    })

    beforeEach(async function () {
        skiptTestIfNoValidConn(validConnection, this)
        tempDir = path.join(os.tmpdir(), 'gumby-test')
        fs.mkdirSync(tempDir)
        tempFileName = `testfile-${Date.now()}.txt`
        tempFilePath = path.join(tempDir, tempFileName)
        fs.writeFileSync(tempFilePath, 'sample content for the test file')
        zippedCodePath = await zipCode(tempDir)
    })

    afterEach(function () {
        fs.rmSync(tempDir, { recursive: true, force: true })
    })

    it('WHEN upload payload with missing sha256 in headers THEN fails to upload', async function () {
        const sha256 = getSha256(zippedCodePath)
        const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        const headersObj = {
            'x-amz-checksum-sha256': '',
            'Content-Type': 'application/zip',
        }
        await assert.rejects(async () => {
            await fetch('PUT', response.uploadUrl, { body: fs.readFileSync(zippedCodePath), headers: headersObj })
                .response
        })
    })

    it('WHEN upload artifact to S3 with unsigned upload URL THEN fails to upload', async function () {
        await assert.rejects(async () => {
            await uploadArtifactToS3(zippedCodePath, {
                uploadId: 'dummyId',
                uploadUrl: 'https://aws-transform-artifacts-us-east-1.s3.amazonaws.com',
            })
        })
    })
})
