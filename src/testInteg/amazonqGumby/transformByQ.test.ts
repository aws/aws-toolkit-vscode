/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getSha256, uploadArtifactToS3, uploadPayload, zipCode } from '../../codewhisperer/service/transformByQHandler'
import * as codeWhisperer from '../../codewhisperer/client/codewhisperer'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { sleep } from '../../shared/utilities/timeoutUtils'

describe('transformByQ', function () {
    let tempDir = ''
    let tempFileName = ''
    let tempFilePath = ''
    let zippedCodePath = ''

    beforeEach(async function () {
        tempDir = os.tmpdir()
        tempFileName = `testfile-=${Date.now()}.txt`
        tempFilePath = path.join(tempDir, tempFileName)
        fs.writeFileSync(tempFilePath, 'sample content for the test file')
        zippedCodePath = await zipCode(tempDir)
    })

    afterEach(function () {
        fs.rmSync(tempFilePath, { force: true })
    })

    it('WHEN upload payload with valid request THEN succeeds', async function () {
        await assert.doesNotReject(async () => {
            await uploadPayload(zippedCodePath)
        })
    })

    it('WHEN upload artifact to S3 with expired upload URL THEN fails to upload', async function () {
        const sha256 = getSha256(zippedCodePath)
        const createUploadUrlResponse = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        await sleep(65000) // sleep for 65 seconds since the upload URL expires after 60 seconds
        const uploadStatusCode = await uploadArtifactToS3(zippedCodePath, createUploadUrlResponse)
        assert.notStrictEqual(uploadStatusCode, 200)
    })

    it('WHEN upload artifact to S3 with unsigned upload URL THEN fails to upload', async function () {
        const uploadStatusCode = await uploadArtifactToS3(zippedCodePath, {
            uploadId: 'dummyId',
            uploadUrl: 'https://aws-transform-artifacts-us-east-1.s3.amazonaws.com',
        })
        assert.notStrictEqual(uploadStatusCode, 200)
    })
})
