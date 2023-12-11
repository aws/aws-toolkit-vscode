/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { uploadArtifactToS3, uploadPayload, zipCode } from '../../codewhisperer/service/transformByQHandler'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

describe('transformByQ', function () {
    let tempDir = ''
    let tempFileName = ''
    let tempFilePath = ''
    let zippedCodePath = ''

    beforeEach(async function () {
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

    it('WHEN upload payload with valid request THEN succeeds', async function () {
        await assert.doesNotReject(async () => {
            await uploadPayload(zippedCodePath)
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
